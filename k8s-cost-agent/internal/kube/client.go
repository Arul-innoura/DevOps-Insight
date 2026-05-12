// Package kube wraps client-go construction for in-cluster and out-of-cluster use.
package kube

import (
	"fmt"
	"net"
	"net/url"
	"strings"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

// HostOverrides rewrites the API server URL after kubeconfig load.
// Set LoopbackHostRemap to host.docker.internal (Docker Desktop) when kubeconfig
// uses https://127.0.0.1:PORT but the process runs in a container.
type HostOverrides struct {
	APIServerURL      string // full URL, replaces cluster server from kubeconfig
	LoopbackHostRemap string // hostname; 127.0.0.1 / localhost in kubeconfig → this host, port preserved
	TLSServerName     string // optional certificate verify name (e.g. 127.0.0.1 after remap)
}

func normalizeAPIHost(raw string) string {
	return strings.TrimSuffix(strings.TrimSpace(raw), "/")
}

func remapLoopbackAPI(restHost, newHostname string) (newURL string, origForTLS string, ok bool) {
	u, err := url.Parse(restHost)
	if err != nil {
		return restHost, "", false
	}
	h := u.Hostname()
	if h != "127.0.0.1" && h != "localhost" {
		return restHost, "", false
	}
	port := u.Port()
	if port == "" {
		if u.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	u.Host = net.JoinHostPort(newHostname, port)
	return normalizeAPIHost(u.String()), h, true
}

func (o HostOverrides) apply(cfg *rest.Config) {
	var remapTLSDefault string

	if o.APIServerURL != "" {
		cfg.Host = normalizeAPIHost(o.APIServerURL)
	} else if o.LoopbackHostRemap != "" {
		replaced, origTLS, ok := remapLoopbackAPI(cfg.Host, o.LoopbackHostRemap)
		if ok {
			cfg.Host = replaced
			remapTLSDefault = origTLS
		}
	}

	switch {
	case o.TLSServerName != "":
		cfg.TLSClientConfig.ServerName = o.TLSServerName
	case remapTLSDefault != "":
		cfg.TLSClientConfig.ServerName = remapTLSDefault
	}
}

// Clients bundles the standard kube client and the metrics.k8s.io client.
// metrics-server may be absent — callers must tolerate Metrics being usable but empty.
type Clients struct {
	Core       *kubernetes.Clientset
	Metrics    *metricsclient.Clientset
	RestConfig *rest.Config
}

// New returns a Clients tied to the given kubeconfig file (out-of-cluster) or
// the pod's service-account (in-cluster, when kubeconfigPath is empty).
func New(kubeconfigPath string, host HostOverrides) (*Clients, error) {
	cfg, err := loadConfig(kubeconfigPath)
	if err != nil {
		return nil, err
	}
	host.apply(cfg)

	// Use protobuf where the API supports it — much smaller wire payloads.
	cfg.AcceptContentTypes = "application/vnd.kubernetes.protobuf,application/json"
	cfg.ContentType = "application/vnd.kubernetes.protobuf"

	core, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("kubernetes client: %w", err)
	}

	// Metrics API only speaks JSON, so build it from a copy with defaults.
	mcfg := rest.CopyConfig(cfg)
	mcfg.AcceptContentTypes = "application/json"
	mcfg.ContentType = "application/json"
	mc, err := metricsclient.NewForConfig(mcfg)
	if err != nil {
		return nil, fmt.Errorf("metrics client: %w", err)
	}

	return &Clients{Core: core, Metrics: mc, RestConfig: cfg}, nil
}

func loadConfig(path string) (*rest.Config, error) {
	if path == "" {
		return rest.InClusterConfig()
	}
	return clientcmd.BuildConfigFromFlags("", path)
}
