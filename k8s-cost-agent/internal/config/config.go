// Package config loads runtime configuration from environment variables.
// All knobs have sane defaults so the agent runs with zero config in-cluster.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	// Kubernetes
	Kubeconfig            string // empty = in-cluster
	KubeAPIServerOverride string // full URL replaces cluster server from kubeconfig (Docker / odd networking)
	KubeLoopbackHostRemap string // if set and server is 127.0.0.1 or localhost → this host (port kept); e.g. host.docker.internal
	KubeTLSServerName     string // optional TLS verify/SNI override when Host hostname changes
	ClusterName           string // free-form label written to every record
	EnvironmentID         string // matches the Spring backend's environmentId

	// MongoDB — same DB as the Spring backend, separate collections
	MongoURI        string
	MongoDatabase   string
	NamespaceColl   string
	NodeColl        string
	ServiceCommColl string
	CostSummaryColl string

	// Collection schedule
	CollectInterval time.Duration
	RetentionDays   int // TTL on raw snapshots; 0 disables

	// HTTP API
	HTTPAddr string

	// Pricing overrides (USD). Falls back to embedded Azure list-price defaults.
	PriceCPUPerHour     float64 // per vCPU-hour
	PriceMemoryGBPerHr  float64 // per GiB-hour
	PriceStorageGBPerHr float64 // per GiB-hour managed disk
	PriceEgressGB       float64 // per GiB internet egress
	PriceLBPerHour      float64 // per LoadBalancer-hour
}

func Load() (Config, error) {
	c := Config{
		Kubeconfig:            getEnv("AGENT_KUBECONFIG", ""),
		KubeAPIServerOverride: getEnv("AGENT_KUBE_API_SERVER", ""),
		KubeLoopbackHostRemap: getEnv("AGENT_KUBE_API_HOST_REMAP", ""),
		KubeTLSServerName:     getEnv("AGENT_KUBE_TLS_SERVER_NAME", ""),
		ClusterName:           getEnv("AGENT_CLUSTER_NAME", "default-cluster"),
		EnvironmentID:         getEnv("AGENT_ENVIRONMENT_ID", "default-cluster"),
		MongoURI:              getEnv("AGENT_MONGODB_URI", "mongodb://localhost:27017"),
		MongoDatabase:         getEnv("AGENT_MONGODB_DATABASE", "devops_portal"),
		NamespaceColl:         getEnv("AGENT_COLL_NAMESPACE", "k8s_namespace_metrics"),
		NodeColl:              getEnv("AGENT_COLL_NODE", "k8s_node_metrics"),
		ServiceCommColl:       getEnv("AGENT_COLL_SERVICE_COMM", "k8s_service_communications"),
		CostSummaryColl:       getEnv("AGENT_COLL_COST_SUMMARY", "k8s_cost_summary"),
		HTTPAddr:              getEnv("AGENT_HTTP_ADDR", ":8090"),
		CollectInterval:       getDuration("AGENT_COLLECT_INTERVAL", 60*time.Second),
		RetentionDays:         getInt("AGENT_RETENTION_DAYS", 14),
		PriceCPUPerHour:       getFloat("AGENT_PRICE_CPU_HOUR", 0.0316),
		PriceMemoryGBPerHr:    getFloat("AGENT_PRICE_MEM_GB_HOUR", 0.00424),
		PriceStorageGBPerHr:   getFloat("AGENT_PRICE_DISK_GB_HOUR", 0.000205),
		PriceEgressGB:         getFloat("AGENT_PRICE_EGRESS_GB", 0.087),
		PriceLBPerHour:        getFloat("AGENT_PRICE_LB_HOUR", 0.025),
	}
	if c.CollectInterval < 15*time.Second {
		return c, fmt.Errorf("AGENT_COLLECT_INTERVAL must be >= 15s (got %s)", c.CollectInterval)
	}
	return c, nil
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getDuration(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func getInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getFloat(k string, def float64) float64 {
	if v := os.Getenv(k); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
