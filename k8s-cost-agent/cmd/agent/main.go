// Command agent runs the in-cluster cost monitoring agent. Single binary,
// single replica — minimal cluster footprint by design.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/encipher/k8s-cost-agent/internal/api"
	"github.com/encipher/k8s-cost-agent/internal/collector"
	"github.com/encipher/k8s-cost-agent/internal/config"
	"github.com/encipher/k8s-cost-agent/internal/cost"
	"github.com/encipher/k8s-cost-agent/internal/kube"
	"github.com/encipher/k8s-cost-agent/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	must(err, "load config")
	logger.Info("starting k8s-cost-agent",
		"cluster", cfg.ClusterName, "env", cfg.EnvironmentID,
		"interval", cfg.CollectInterval.String(), "http", cfg.HTTPAddr,
	)

	rootCtx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	clients, err := kube.New(cfg.Kubeconfig, kube.HostOverrides{
		APIServerURL:      cfg.KubeAPIServerOverride,
		LoopbackHostRemap: cfg.KubeLoopbackHostRemap,
		TLSServerName:     cfg.KubeTLSServerName,
	})
	must(err, "kube client")
	logger.Info("kubernetes client",
		"apiHost", clients.RestConfig.Host,
		"tlsServerName", clients.RestConfig.TLSClientConfig.ServerName,
	)

	store, err := storage.Open(rootCtx, cfg)
	must(err, "open mongo")
	defer func() {
		shutCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = store.Close(shutCtx)
	}()

	calc := cost.New(cfg.PriceCPUPerHour, cfg.PriceMemoryGBPerHr, cfg.PriceStorageGBPerHr, cfg.PriceEgressGB, cfg.PriceLBPerHour)
	col := collector.New(clients, calc, cfg.ClusterName, cfg.EnvironmentID)
	srv := api.New(store, cfg.EnvironmentID, cfg.ClusterName)

	// HTTP server lifecycle — separate goroutine, graceful shutdown on signal.
	httpSrv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		logger.Info("http listening", "addr", cfg.HTTPAddr)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server", "err", err)
			cancel()
		}
	}()
	defer func() {
		shutCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		_ = httpSrv.Shutdown(shutCtx)
	}()

	// Run a tick immediately so the first /readyz succeeds quickly.
	runCycle(rootCtx, col, store, srv, logger)

	tick := time.NewTicker(cfg.CollectInterval)
	defer tick.Stop()
	for {
		select {
		case <-rootCtx.Done():
			logger.Info("shutdown requested")
			return
		case <-tick.C:
			runCycle(rootCtx, col, store, srv, logger)
		}
	}
}

func runCycle(ctx context.Context, col *collector.Collector, store *storage.Store, srv *api.Server, log *slog.Logger) {
	cycle, err := col.Run(ctx)
	if err != nil {
		log.Error("cycle failed", "err", err)
		return
	}
	if err := store.WriteCycle(ctx, cycle); err != nil {
		log.Error("write failed", "err", err)
		return
	}
	srv.Publish(cycle)
	log.Info("cycle ok",
		"namespaces", len(cycle.Namespaces),
		"nodes", len(cycle.Nodes),
		"edges", len(cycle.ServiceComms),
		"hourlyUSD", cycle.Summary.TotalCostPerHour,
		"durationMs", cycle.Summary.CollectionDurationMs,
		"metricsServer", cycle.MetricsServerOK,
	)
}

func must(err error, msg string) {
	if err == nil {
		return
	}
	slog.Error("fatal", "stage", msg, "err", err)
	os.Exit(1)
}
