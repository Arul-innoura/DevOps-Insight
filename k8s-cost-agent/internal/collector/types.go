// Package collector defines the metric record shapes and the orchestrator
// that produces them every cycle. One NamespaceMetrics document is written
// per namespace per tick, plus per-node and per-service-pair documents.
package collector

import "time"

// NamespaceMetrics captures 100+ point-in-time fields for one namespace.
// Field names map 1:1 to Mongo BSON keys via the `bson` tag, so the Spring
// backend or any consumer can read them without translation.
type NamespaceMetrics struct {
	ID            string    `bson:"_id,omitempty"`
	EnvironmentID string    `bson:"environmentId"`
	ClusterName   string    `bson:"clusterName"`
	Namespace     string    `bson:"namespace"`
	CapturedAt    time.Time `bson:"capturedAt"`

	// ── Pods (10) ─────────────────────────────────────────────────────────
	PodCountTotal          int   `bson:"podCountTotal"`
	PodCountRunning        int   `bson:"podCountRunning"`
	PodCountPending        int   `bson:"podCountPending"`
	PodCountFailed         int   `bson:"podCountFailed"`
	PodCountSucceeded      int   `bson:"podCountSucceeded"`
	PodCountUnknown        int   `bson:"podCountUnknown"`
	PodRestartCountTotal   int32 `bson:"podRestartCountTotal"`
	PodAgeAvgSeconds       int64 `bson:"podAgeAvgSeconds"`
	PodOldestAgeSeconds    int64 `bson:"podOldestAgeSeconds"`
	PodYoungestAgeSeconds  int64 `bson:"podYoungestAgeSeconds"`

	// ── Containers (8) ────────────────────────────────────────────────────
	ContainerCountTotal       int `bson:"containerCountTotal"`
	ContainerCountReady       int `bson:"containerCountReady"`
	ContainerCountNotReady    int `bson:"containerCountNotReady"`
	ContainerCountInit        int `bson:"containerCountInit"`
	ContainerImageUniqueCount int `bson:"containerImageUniqueCount"`
	ContainerTerminatedCount  int `bson:"containerTerminatedCount"`
	ContainerWaitingCount     int `bson:"containerWaitingCount"`
	ContainerOOMKilledCount   int `bson:"containerOomKilledCount"`

	// ── CPU (7) ───────────────────────────────────────────────────────────
	CPURequestMillicores      int64   `bson:"cpuRequestMillicores"`
	CPULimitMillicores        int64   `bson:"cpuLimitMillicores"`
	CPUUsageMillicoresActual  int64   `bson:"cpuUsageMillicoresActual"`
	CPUUsagePctOfRequest      float64 `bson:"cpuUsagePctOfRequest"`
	CPUUsagePctOfLimit        float64 `bson:"cpuUsagePctOfLimit"`
	CPUThrottledSecondsTotal  float64 `bson:"cpuThrottledSecondsTotal"`
	CPUThrottledPeriodsTotal  float64 `bson:"cpuThrottledPeriodsTotal"`

	// ── Memory (10) ───────────────────────────────────────────────────────
	MemoryRequestBytes       int64   `bson:"memoryRequestBytes"`
	MemoryLimitBytes         int64   `bson:"memoryLimitBytes"`
	MemoryUsageBytesActual   int64   `bson:"memoryUsageBytesActual"`
	MemoryUsagePctOfRequest  float64 `bson:"memoryUsagePctOfRequest"`
	MemoryUsagePctOfLimit    float64 `bson:"memoryUsagePctOfLimit"`
	MemoryWorkingSetBytes    int64   `bson:"memoryWorkingSetBytes"`
	MemoryRSSBytes           int64   `bson:"memoryRssBytes"`
	MemoryCacheBytes         int64   `bson:"memoryCacheBytes"`
	MemorySwapBytes          int64   `bson:"memorySwapBytes"`
	MemoryOOMEventsTotal     int64   `bson:"memoryOomEventsTotal"`

	// ── Storage (10) ──────────────────────────────────────────────────────
	PVCCountTotal               int     `bson:"pvcCountTotal"`
	PVCCountBound               int     `bson:"pvcCountBound"`
	PVCCountPending             int     `bson:"pvcCountPending"`
	PVCapacityBytesTotal        int64   `bson:"pvCapacityBytesTotal"`
	PVUsedBytesTotal            int64   `bson:"pvUsedBytesTotal"`
	PVAvailableBytesTotal       int64   `bson:"pvAvailableBytesTotal"`
	PVUsagePct                  float64 `bson:"pvUsagePct"`
	EphemeralStorageRequestBytes int64  `bson:"ephemeralStorageRequestBytes"`
	EphemeralStorageLimitBytes   int64  `bson:"ephemeralStorageLimitBytes"`
	EphemeralStorageUsageBytes   int64  `bson:"ephemeralStorageUsageBytes"`

	// ── Network (10) ──────────────────────────────────────────────────────
	NetworkRxBytesTotal       uint64 `bson:"networkRxBytesTotal"`
	NetworkTxBytesTotal       uint64 `bson:"networkTxBytesTotal"`
	NetworkRxPacketsTotal     uint64 `bson:"networkRxPacketsTotal"`
	NetworkTxPacketsTotal     uint64 `bson:"networkTxPacketsTotal"`
	NetworkRxErrorsTotal      uint64 `bson:"networkRxErrorsTotal"`
	NetworkTxErrorsTotal      uint64 `bson:"networkTxErrorsTotal"`
	NetworkRxDroppedTotal     uint64 `bson:"networkRxDroppedTotal"`
	NetworkTxDroppedTotal     uint64 `bson:"networkTxDroppedTotal"`
	NetworkEgressInternetBytes uint64 `bson:"networkEgressInternetBytes"`
	NetworkEgressInternalBytes uint64 `bson:"networkEgressInternalBytes"`

	// ── Workloads (17) ────────────────────────────────────────────────────
	DeploymentCount             int   `bson:"deploymentCount"`
	DeploymentReplicasDesired   int32 `bson:"deploymentReplicasDesired"`
	DeploymentReplicasAvailable int32 `bson:"deploymentReplicasAvailable"`
	DeploymentReplicasUnavailable int32 `bson:"deploymentReplicasUnavailable"`
	StatefulSetCount            int   `bson:"statefulSetCount"`
	StatefulSetReplicasReady    int32 `bson:"statefulSetReplicasReady"`
	DaemonSetCount              int   `bson:"daemonSetCount"`
	DaemonSetPodsReady          int32 `bson:"daemonSetPodsReady"`
	JobCount                    int   `bson:"jobCount"`
	JobSucceeded                int32 `bson:"jobSucceeded"`
	JobFailed                   int32 `bson:"jobFailed"`
	CronJobCount                int   `bson:"cronJobCount"`
	CronJobActive               int32 `bson:"cronJobActive"`
	ReplicaSetCount             int   `bson:"replicaSetCount"`
	HPACount                    int   `bson:"hpaCount"`
	HPACurrentReplicas          int32 `bson:"hpaCurrentReplicas"`
	HPADesiredReplicas          int32 `bson:"hpaDesiredReplicas"`

	// ── Services / networking (9) ─────────────────────────────────────────
	ServiceCountTotal        int `bson:"serviceCountTotal"`
	ServiceCountClusterIP    int `bson:"serviceCountClusterIp"`
	ServiceCountNodePort     int `bson:"serviceCountNodePort"`
	ServiceCountLoadBalancer int `bson:"serviceCountLoadBalancer"`
	ServiceCountExternalName int `bson:"serviceCountExternalName"`
	IngressCount             int `bson:"ingressCount"`
	IngressRulesCount        int `bson:"ingressRulesCount"`
	EndpointCount            int `bson:"endpointCount"`
	NetworkPolicyCount       int `bson:"networkPolicyCount"`

	// ── Configuration / RBAC (7) ──────────────────────────────────────────
	ConfigMapCount         int   `bson:"configMapCount"`
	ConfigMapSizeBytesTotal int64 `bson:"configMapSizeBytesTotal"`
	SecretCount            int   `bson:"secretCount"`
	SecretSizeBytesTotal   int64 `bson:"secretSizeBytesTotal"`
	ServiceAccountCount    int   `bson:"serviceAccountCount"`
	RoleCount              int   `bson:"roleCount"`
	RoleBindingCount       int   `bson:"roleBindingCount"`

	// ── Events (4) ────────────────────────────────────────────────────────
	EventCountWarningLastMin int `bson:"eventCountWarningLastMin"`
	EventCountNormalLastMin  int `bson:"eventCountNormalLastMin"`
	EventCountWarningTotal   int `bson:"eventCountWarningTotal"`
	EventCountFailedScheduling int `bson:"eventCountFailedScheduling"`

	// ── Quotas (4) ────────────────────────────────────────────────────────
	ResourceQuotaCount       int     `bson:"resourceQuotaCount"`
	ResourceQuotaCPUUsedPct  float64 `bson:"resourceQuotaCpuUsedPct"`
	ResourceQuotaMemUsedPct  float64 `bson:"resourceQuotaMemoryUsedPct"`
	LimitRangeCount          int     `bson:"limitRangeCount"`

	// ── HPA bounds (2) ────────────────────────────────────────────────────
	HPAMinReplicas int32 `bson:"hpaMinReplicas"`
	HPAMaxReplicas int32 `bson:"hpaMaxReplicas"`

	// ── Cost (computed downstream) (9) ────────────────────────────────────
	CostCPUPerHourUSD       float64 `bson:"costCpuPerHourUsd"`
	CostMemoryPerHourUSD    float64 `bson:"costMemoryPerHourUsd"`
	CostStoragePerHourUSD   float64 `bson:"costStoragePerHourUsd"`
	CostNetworkEgressPerHrUSD float64 `bson:"costNetworkEgressPerHourUsd"`
	CostPVPerHourUSD        float64 `bson:"costPvPerHourUsd"`
	CostLBPerHourUSD        float64 `bson:"costLoadBalancerPerHourUsd"`
	CostTotalPerHourUSD     float64 `bson:"costTotalPerHourUsd"`
	CostTotalPerDayUSD      float64 `bson:"costTotalPerDayUsd"`
	CostTotalPerMonthUSD    float64 `bson:"costTotalPerMonthUsd"`
}

// NodeMetrics is one document per node per tick.
type NodeMetrics struct {
	ID            string    `bson:"_id,omitempty"`
	EnvironmentID string    `bson:"environmentId"`
	ClusterName   string    `bson:"clusterName"`
	NodeName      string    `bson:"nodeName"`
	NodePool      string    `bson:"nodePool"`
	InstanceType  string    `bson:"instanceType"`
	Region        string    `bson:"region"`
	Zone          string    `bson:"zone"`
	CapturedAt    time.Time `bson:"capturedAt"`

	Ready                  bool    `bson:"ready"`
	CPUCapacityMillicores  int64   `bson:"cpuCapacityMillicores"`
	CPUAllocatableMilli    int64   `bson:"cpuAllocatableMillicores"`
	CPUUsageMillicores     int64   `bson:"cpuUsageMillicores"`
	MemCapacityBytes       int64   `bson:"memoryCapacityBytes"`
	MemAllocatableBytes    int64   `bson:"memoryAllocatableBytes"`
	MemUsageBytes          int64   `bson:"memoryUsageBytes"`
	PodCount               int     `bson:"podCount"`
	PodCapacity            int64   `bson:"podCapacity"`
	HourlyCostUSD          float64 `bson:"hourlyCostUsd"`
}

// ServiceCommunication captures one configured edge between caller pod/service
// and a target service, plus an estimated bytes counter for the cycle.
type ServiceCommunication struct {
	ID            string    `bson:"_id,omitempty"`
	EnvironmentID string    `bson:"environmentId"`
	ClusterName   string    `bson:"clusterName"`
	CapturedAt    time.Time `bson:"capturedAt"`

	SourceNamespace string `bson:"sourceNamespace"`
	SourceKind      string `bson:"sourceKind"` // Pod / Deployment / Service
	SourceName      string `bson:"sourceName"`

	TargetNamespace string `bson:"targetNamespace"`
	TargetKind      string `bson:"targetKind"` // Service / ExternalName / Ingress
	TargetName      string `bson:"targetName"`
	TargetEndpoint  string `bson:"targetEndpoint"` // host:port if known

	DiscoveredVia  string    `bson:"discoveredVia"` // env / configmap / ingress / dns
	EstimatedBytes uint64    `bson:"estimatedBytes"`
	LastSeen       time.Time `bson:"lastSeen"`
}

// CycleSummary is the top-level cluster roll-up emitted once per cycle.
type CycleSummary struct {
	ID              string    `bson:"_id,omitempty"`
	EnvironmentID   string    `bson:"environmentId"`
	ClusterName     string    `bson:"clusterName"`
	CapturedAt      time.Time `bson:"capturedAt"`
	NamespaceCount  int       `bson:"namespaceCount"`
	NodeCount       int       `bson:"nodeCount"`
	PodCount        int       `bson:"podCount"`
	TotalCostPerHour float64  `bson:"totalCostPerHour"`
	TotalCostPerDay  float64  `bson:"totalCostPerDay"`
	TotalCostPerMonth float64 `bson:"totalCostPerMonth"`
	CollectionDurationMs int64 `bson:"collectionDurationMs"`
	MetricsServerAvailable bool `bson:"metricsServerAvailable"`
}
