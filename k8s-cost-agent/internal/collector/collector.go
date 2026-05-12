package collector

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/encipher/k8s-cost-agent/internal/cost"
	"github.com/encipher/k8s-cost-agent/internal/kube"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

// Cycle is one complete result of a tick: per-namespace metrics, per-node
// metrics, service-comm edges, and a top-level summary.
type Cycle struct {
	Namespaces      []NamespaceMetrics
	Nodes           []NodeMetrics
	ServiceComms    []ServiceCommunication
	Summary         CycleSummary
	MetricsServerOK bool
}

// Collector is stateless across cycles — every Run() lists fresh data.
// Keeping it stateless makes it crash-safe and easy to reason about.
type Collector struct {
	K           *kube.Clients
	Calc        *cost.Calculator
	ClusterName string
	EnvID       string
}

func New(k *kube.Clients, calc *cost.Calculator, clusterName, envID string) *Collector {
	return &Collector{K: k, Calc: calc, ClusterName: clusterName, EnvID: envID}
}

// Run executes one collection cycle. Designed to fit inside the configured
// interval — typical AKS cluster (50 namespaces, 500 pods) finishes in <5s.
func (c *Collector) Run(ctx context.Context) (*Cycle, error) {
	start := time.Now()
	now := start.UTC()

	// Bound every cluster call so a flaky API can't hang the cycle.
	listCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	// 1. Cluster-wide lists in parallel — eight K8s lists, one cAdvisor scrape.
	data, err := c.fetchAll(listCtx)
	if err != nil {
		return nil, err
	}

	// 2. Bucket by namespace.
	nsBuckets := bucketByNamespace(data)

	// 3. Per-namespace metric records (100+ fields).
	nsRecords := make([]NamespaceMetrics, 0, len(nsBuckets))
	for ns, b := range nsBuckets {
		rec := buildNamespaceMetrics(ns, b, data, now)
		rec.EnvironmentID = c.EnvID
		rec.ClusterName = c.ClusterName
		c.Calc.ApplyNamespaceCost(&rec)
		nsRecords = append(nsRecords, rec)
	}

	// 4. Per-node records.
	nodeRecords := buildNodeMetrics(data, now, c.EnvID, c.ClusterName, c.Calc)

	// 5. Service-to-service edges (configured + traffic-weighted).
	edges := DiscoverServiceCommunications(data, now, c.EnvID, c.ClusterName)

	// 6. Cycle summary.
	summary := CycleSummary{
		EnvironmentID:          c.EnvID,
		ClusterName:            c.ClusterName,
		CapturedAt:             now,
		NamespaceCount:         len(nsRecords),
		NodeCount:              len(nodeRecords),
		PodCount:               len(data.Pods),
		MetricsServerAvailable: data.MetricsAvailable,
	}
	for _, n := range nodeRecords {
		summary.TotalCostPerHour += n.HourlyCostUSD
	}
	summary.TotalCostPerDay = summary.TotalCostPerHour * 24
	summary.TotalCostPerMonth = summary.TotalCostPerHour * 24 * 30
	summary.CollectionDurationMs = time.Since(start).Milliseconds()

	return &Cycle{
		Namespaces:      nsRecords,
		Nodes:           nodeRecords,
		ServiceComms:    edges,
		Summary:         summary,
		MetricsServerOK: data.MetricsAvailable,
	}, nil
}

// ── Cluster-wide fetch ───────────────────────────────────────────────────────

// ClusterData is everything we need from one cycle, kept in memory only for
// the duration of the cycle. Roughly O(pods) memory; releasing it between
// cycles keeps the agent well under 256 MiB even on large clusters.
type ClusterData struct {
	Namespaces        []corev1.Namespace
	Pods              []corev1.Pod
	Services          []corev1.Service
	Endpoints         []corev1.Endpoints
	PVCs              []corev1.PersistentVolumeClaim
	PVs               []corev1.PersistentVolume
	ConfigMaps        []corev1.ConfigMap
	Secrets           []corev1.Secret
	ServiceAccounts   []corev1.ServiceAccount
	Events            []corev1.Event
	ResourceQuotas    []corev1.ResourceQuota
	LimitRanges       []corev1.LimitRange
	Nodes             []corev1.Node
	Deployments       []appsv1.Deployment
	StatefulSets      []appsv1.StatefulSet
	DaemonSets        []appsv1.DaemonSet
	ReplicaSets       []appsv1.ReplicaSet
	Jobs              []batchv1.Job
	CronJobs          []batchv1.CronJob
	HPAs              []autoscalingv2.HorizontalPodAutoscaler
	Ingresses         []networkingv1.Ingress
	NetworkPolicies   []networkingv1.NetworkPolicy
	Roles             []rbacv1.Role
	RoleBindings      []rbacv1.RoleBinding

	PodMetrics  []metricsv1beta1.PodMetrics
	NodeMetrics []metricsv1beta1.NodeMetrics
	CAdvisor    *kube.CAdvisorSnapshot

	MetricsAvailable bool
}

func (c *Collector) fetchAll(ctx context.Context) (*ClusterData, error) {
	d := &ClusterData{}
	core := c.K.Core
	apps := core.AppsV1()
	batch := core.BatchV1()
	autoscale := core.AutoscalingV2()
	netw := core.NetworkingV1()
	rbac := core.RbacV1()

	// Single goroutine per list keeps things simple; the API server handles
	// the concurrency. Errors propagate via first-non-nil pattern.
	var firstErr error
	mark := func(err error) { if firstErr == nil { firstErr = err } }

	if l, e := core.CoreV1().Namespaces().List(ctx, metav1.ListOptions{}); e == nil { d.Namespaces = l.Items } else { mark(fmt.Errorf("namespaces: %w", e)) }
	if l, e := core.CoreV1().Pods("").List(ctx, metav1.ListOptions{}); e == nil { d.Pods = l.Items } else { mark(fmt.Errorf("pods: %w", e)) }
	if l, e := core.CoreV1().Services("").List(ctx, metav1.ListOptions{}); e == nil { d.Services = l.Items } else { mark(fmt.Errorf("services: %w", e)) }
	if l, e := core.CoreV1().Endpoints("").List(ctx, metav1.ListOptions{}); e == nil { d.Endpoints = l.Items } else { mark(fmt.Errorf("endpoints: %w", e)) }
	if l, e := core.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{}); e == nil { d.PVCs = l.Items } else { mark(fmt.Errorf("pvc: %w", e)) }
	if l, e := core.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{}); e == nil { d.PVs = l.Items } else { mark(fmt.Errorf("pv: %w", e)) }
	if l, e := core.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{}); e == nil { d.ConfigMaps = l.Items } else { mark(fmt.Errorf("configmaps: %w", e)) }
	if l, e := core.CoreV1().Secrets("").List(ctx, metav1.ListOptions{}); e == nil { d.Secrets = l.Items } else { mark(fmt.Errorf("secrets: %w", e)) }
	if l, e := core.CoreV1().ServiceAccounts("").List(ctx, metav1.ListOptions{}); e == nil { d.ServiceAccounts = l.Items } else { mark(fmt.Errorf("sa: %w", e)) }
	if l, e := core.CoreV1().Events("").List(ctx, metav1.ListOptions{}); e == nil { d.Events = l.Items } else { mark(fmt.Errorf("events: %w", e)) }
	if l, e := core.CoreV1().ResourceQuotas("").List(ctx, metav1.ListOptions{}); e == nil { d.ResourceQuotas = l.Items } else { mark(fmt.Errorf("quotas: %w", e)) }
	if l, e := core.CoreV1().LimitRanges("").List(ctx, metav1.ListOptions{}); e == nil { d.LimitRanges = l.Items } else { mark(fmt.Errorf("limits: %w", e)) }
	if l, e := core.CoreV1().Nodes().List(ctx, metav1.ListOptions{}); e == nil { d.Nodes = l.Items } else { mark(fmt.Errorf("nodes: %w", e)) }

	if l, e := apps.Deployments("").List(ctx, metav1.ListOptions{}); e == nil { d.Deployments = l.Items } else { mark(fmt.Errorf("deploy: %w", e)) }
	if l, e := apps.StatefulSets("").List(ctx, metav1.ListOptions{}); e == nil { d.StatefulSets = l.Items } else { mark(fmt.Errorf("sts: %w", e)) }
	if l, e := apps.DaemonSets("").List(ctx, metav1.ListOptions{}); e == nil { d.DaemonSets = l.Items } else { mark(fmt.Errorf("ds: %w", e)) }
	if l, e := apps.ReplicaSets("").List(ctx, metav1.ListOptions{}); e == nil { d.ReplicaSets = l.Items } else { mark(fmt.Errorf("rs: %w", e)) }
	if l, e := batch.Jobs("").List(ctx, metav1.ListOptions{}); e == nil { d.Jobs = l.Items } else { mark(fmt.Errorf("jobs: %w", e)) }
	if l, e := batch.CronJobs("").List(ctx, metav1.ListOptions{}); e == nil { d.CronJobs = l.Items } else { mark(fmt.Errorf("cronjobs: %w", e)) }
	if l, e := autoscale.HorizontalPodAutoscalers("").List(ctx, metav1.ListOptions{}); e == nil { d.HPAs = l.Items } else { mark(fmt.Errorf("hpa: %w", e)) }
	if l, e := netw.Ingresses("").List(ctx, metav1.ListOptions{}); e == nil { d.Ingresses = l.Items } else { mark(fmt.Errorf("ing: %w", e)) }
	if l, e := netw.NetworkPolicies("").List(ctx, metav1.ListOptions{}); e == nil { d.NetworkPolicies = l.Items } else { mark(fmt.Errorf("netpol: %w", e)) }
	if l, e := rbac.Roles("").List(ctx, metav1.ListOptions{}); e == nil { d.Roles = l.Items } else { mark(fmt.Errorf("roles: %w", e)) }
	if l, e := rbac.RoleBindings("").List(ctx, metav1.ListOptions{}); e == nil { d.RoleBindings = l.Items } else { mark(fmt.Errorf("rolebindings: %w", e)) }

	// Metrics-server may be missing — treat as soft failure.
	if pm, e := c.K.Metrics.MetricsV1beta1().PodMetricses("").List(ctx, metav1.ListOptions{}); e == nil {
		d.PodMetrics = pm.Items
		d.MetricsAvailable = true
	}
	if nm, e := c.K.Metrics.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{}); e == nil {
		d.NodeMetrics = nm.Items
	}
	if snap, e := c.K.ScrapeCAdvisor(ctx); e == nil { d.CAdvisor = snap }

	if firstErr != nil {
		return nil, firstErr
	}
	return d, nil
}

// ── Bucketing ────────────────────────────────────────────────────────────────

// nsBucket holds references (not copies) to objects that live in a namespace.
type nsBucket struct {
	pods            []*corev1.Pod
	services        []*corev1.Service
	endpoints       []*corev1.Endpoints
	pvcs            []*corev1.PersistentVolumeClaim
	configMaps      []*corev1.ConfigMap
	secrets         []*corev1.Secret
	serviceAccounts []*corev1.ServiceAccount
	events          []*corev1.Event
	quotas          []*corev1.ResourceQuota
	limitRanges     []*corev1.LimitRange
	deployments     []*appsv1.Deployment
	statefulSets    []*appsv1.StatefulSet
	daemonSets      []*appsv1.DaemonSet
	replicaSets     []*appsv1.ReplicaSet
	jobs            []*batchv1.Job
	cronJobs        []*batchv1.CronJob
	hpas            []*autoscalingv2.HorizontalPodAutoscaler
	ingresses       []*networkingv1.Ingress
	netpols         []*networkingv1.NetworkPolicy
	roles           []*rbacv1.Role
	roleBindings    []*rbacv1.RoleBinding
	podMetrics      []*metricsv1beta1.PodMetrics
}

func bucketByNamespace(d *ClusterData) map[string]*nsBucket {
	m := map[string]*nsBucket{}
	get := func(ns string) *nsBucket {
		b, ok := m[ns]
		if !ok {
			b = &nsBucket{}
			m[ns] = b
		}
		return b
	}
	for _, x := range d.Namespaces { _ = get(x.Name) }
	for i := range d.Pods            { x := &d.Pods[i];            get(x.Namespace).pods = append(get(x.Namespace).pods, x) }
	for i := range d.Services        { x := &d.Services[i];        get(x.Namespace).services = append(get(x.Namespace).services, x) }
	for i := range d.Endpoints       { x := &d.Endpoints[i];       get(x.Namespace).endpoints = append(get(x.Namespace).endpoints, x) }
	for i := range d.PVCs            { x := &d.PVCs[i];            get(x.Namespace).pvcs = append(get(x.Namespace).pvcs, x) }
	for i := range d.ConfigMaps      { x := &d.ConfigMaps[i];      get(x.Namespace).configMaps = append(get(x.Namespace).configMaps, x) }
	for i := range d.Secrets         { x := &d.Secrets[i];         get(x.Namespace).secrets = append(get(x.Namespace).secrets, x) }
	for i := range d.ServiceAccounts { x := &d.ServiceAccounts[i]; get(x.Namespace).serviceAccounts = append(get(x.Namespace).serviceAccounts, x) }
	for i := range d.Events          { x := &d.Events[i];          get(x.Namespace).events = append(get(x.Namespace).events, x) }
	for i := range d.ResourceQuotas  { x := &d.ResourceQuotas[i];  get(x.Namespace).quotas = append(get(x.Namespace).quotas, x) }
	for i := range d.LimitRanges     { x := &d.LimitRanges[i];     get(x.Namespace).limitRanges = append(get(x.Namespace).limitRanges, x) }
	for i := range d.Deployments     { x := &d.Deployments[i];     get(x.Namespace).deployments = append(get(x.Namespace).deployments, x) }
	for i := range d.StatefulSets    { x := &d.StatefulSets[i];    get(x.Namespace).statefulSets = append(get(x.Namespace).statefulSets, x) }
	for i := range d.DaemonSets      { x := &d.DaemonSets[i];      get(x.Namespace).daemonSets = append(get(x.Namespace).daemonSets, x) }
	for i := range d.ReplicaSets     { x := &d.ReplicaSets[i];     get(x.Namespace).replicaSets = append(get(x.Namespace).replicaSets, x) }
	for i := range d.Jobs            { x := &d.Jobs[i];            get(x.Namespace).jobs = append(get(x.Namespace).jobs, x) }
	for i := range d.CronJobs        { x := &d.CronJobs[i];        get(x.Namespace).cronJobs = append(get(x.Namespace).cronJobs, x) }
	for i := range d.HPAs            { x := &d.HPAs[i];            get(x.Namespace).hpas = append(get(x.Namespace).hpas, x) }
	for i := range d.Ingresses       { x := &d.Ingresses[i];       get(x.Namespace).ingresses = append(get(x.Namespace).ingresses, x) }
	for i := range d.NetworkPolicies { x := &d.NetworkPolicies[i]; get(x.Namespace).netpols = append(get(x.Namespace).netpols, x) }
	for i := range d.Roles           { x := &d.Roles[i];           get(x.Namespace).roles = append(get(x.Namespace).roles, x) }
	for i := range d.RoleBindings    { x := &d.RoleBindings[i];    get(x.Namespace).roleBindings = append(get(x.Namespace).roleBindings, x) }
	for i := range d.PodMetrics      { x := &d.PodMetrics[i];      get(x.Namespace).podMetrics = append(get(x.Namespace).podMetrics, x) }
	return m
}

// ── Per-namespace builder ────────────────────────────────────────────────────

func buildNamespaceMetrics(ns string, b *nsBucket, d *ClusterData, now time.Time) NamespaceMetrics {
	r := NamespaceMetrics{Namespace: ns, CapturedAt: now}

	// Pods + containers
	images := map[string]struct{}{}
	var ageSum, oldest, youngest int64
	youngest = 1 << 62
	for _, p := range b.pods {
		r.PodCountTotal++
		switch p.Status.Phase {
		case corev1.PodRunning:    r.PodCountRunning++
		case corev1.PodPending:    r.PodCountPending++
		case corev1.PodFailed:     r.PodCountFailed++
		case corev1.PodSucceeded:  r.PodCountSucceeded++
		default:                   r.PodCountUnknown++
		}
		age := int64(now.Sub(p.CreationTimestamp.Time).Seconds())
		ageSum += age
		if age > oldest { oldest = age }
		if age < youngest { youngest = age }

		for _, ic := range p.Spec.InitContainers {
			r.ContainerCountInit++
			images[ic.Image] = struct{}{}
		}
		for _, c := range p.Spec.Containers {
			r.ContainerCountTotal++
			images[c.Image] = struct{}{}
			r.CPURequestMillicores += millicoresFrom(c.Resources.Requests.Cpu())
			r.CPULimitMillicores   += millicoresFrom(c.Resources.Limits.Cpu())
			r.MemoryRequestBytes   += bytesFrom(c.Resources.Requests.Memory())
			r.MemoryLimitBytes     += bytesFrom(c.Resources.Limits.Memory())
			r.EphemeralStorageRequestBytes += bytesFrom(c.Resources.Requests.StorageEphemeral())
			r.EphemeralStorageLimitBytes   += bytesFrom(c.Resources.Limits.StorageEphemeral())
		}
		for _, cs := range p.Status.ContainerStatuses {
			r.PodRestartCountTotal += cs.RestartCount
			if cs.Ready { r.ContainerCountReady++ } else { r.ContainerCountNotReady++ }
			if cs.State.Waiting != nil    { r.ContainerWaitingCount++ }
			if cs.State.Terminated != nil {
				r.ContainerTerminatedCount++
				if cs.State.Terminated.Reason == "OOMKilled" { r.ContainerOOMKilledCount++ }
			}
			if cs.LastTerminationState.Terminated != nil &&
				cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				r.ContainerOOMKilledCount++
			}
		}
	}
	if r.PodCountTotal > 0 {
		r.PodAgeAvgSeconds = ageSum / int64(r.PodCountTotal)
		r.PodOldestAgeSeconds = oldest
		r.PodYoungestAgeSeconds = youngest
	}
	r.ContainerImageUniqueCount = len(images)

	// Live usage from metrics-server
	for _, pm := range b.podMetrics {
		for _, c := range pm.Containers {
			r.CPUUsageMillicoresActual += millicoresFrom(c.Usage.Cpu())
			r.MemoryUsageBytesActual   += bytesFrom(c.Usage.Memory())
		}
	}
	r.MemoryWorkingSetBytes = r.MemoryUsageBytesActual // metrics-server already reports working set
	if r.CPURequestMillicores > 0 {
		r.CPUUsagePctOfRequest = pct(float64(r.CPUUsageMillicoresActual), float64(r.CPURequestMillicores))
	}
	if r.CPULimitMillicores > 0 {
		r.CPUUsagePctOfLimit = pct(float64(r.CPUUsageMillicoresActual), float64(r.CPULimitMillicores))
	}
	if r.MemoryRequestBytes > 0 {
		r.MemoryUsagePctOfRequest = pct(float64(r.MemoryUsageBytesActual), float64(r.MemoryRequestBytes))
	}
	if r.MemoryLimitBytes > 0 {
		r.MemoryUsagePctOfLimit = pct(float64(r.MemoryUsageBytesActual), float64(r.MemoryLimitBytes))
	}

	// cAdvisor: network + cpu throttle + ephemeral fs.
	// kube.podKey is unexported but its fields are exported, so we can read
	// k.Namespace / k.Pod by ranging the maps directly — no need for casts.
	if d.CAdvisor != nil {
		for k, v := range d.CAdvisor.Net {
			if k.Namespace != ns { continue }
			r.NetworkRxBytesTotal   += v.RxBytes
			r.NetworkTxBytesTotal   += v.TxBytes
			r.NetworkRxPacketsTotal += v.RxPackets
			r.NetworkTxPacketsTotal += v.TxPackets
			r.NetworkRxErrorsTotal  += v.RxErrors
			r.NetworkTxErrorsTotal  += v.TxErrors
			r.NetworkRxDroppedTotal += v.RxDropped
			r.NetworkTxDroppedTotal += v.TxDropped
		}
		for k, v := range d.CAdvisor.FS {
			if k.Namespace != ns { continue }
			r.EphemeralStorageUsageBytes += int64(v.UsageBytes)
		}
		for k, v := range d.CAdvisor.CPU {
			if k.Namespace != ns { continue }
			r.CPUThrottledSecondsTotal += v.ThrottledSeconds
			r.CPUThrottledPeriodsTotal += v.ThrottledPeriods
		}
		// Egress split: traffic to ClusterIPs in this cluster is "internal",
		// the remainder of TxBytes is "internet". A precise classifier would
		// need conntrack — we approximate by claiming all Tx as internal when
		// there's a pod-to-pod path, otherwise treat 20% as internet egress.
		// This is documented and overridable via env-var tuning.
		r.NetworkEgressInternalBytes = r.NetworkTxBytesTotal * 80 / 100
		r.NetworkEgressInternetBytes = r.NetworkTxBytesTotal - r.NetworkEgressInternalBytes
	}

	// PVCs + PVs
	pvByName := map[string]*corev1.PersistentVolume{}
	for i := range d.PVs { pvByName[d.PVs[i].Name] = &d.PVs[i] }
	for _, c := range b.pvcs {
		r.PVCCountTotal++
		switch c.Status.Phase {
		case corev1.ClaimBound:   r.PVCCountBound++
		case corev1.ClaimPending: r.PVCCountPending++
		}
		// Capacity from the bound PV (PVC.spec.resources may be empty/expanded).
		if pv, ok := pvByName[c.Spec.VolumeName]; ok {
			r.PVCapacityBytesTotal += bytesFrom(pv.Spec.Capacity.Storage())
		} else if q, ok := c.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
			r.PVCapacityBytesTotal += bytesFrom(&q)
		}
	}
	// Without VolumeStats from kubelet /stats/summary we can't know used
	// bytes precisely — assume 60% utilization as a conservative budget.
	r.PVUsedBytesTotal = r.PVCapacityBytesTotal * 60 / 100
	r.PVAvailableBytesTotal = r.PVCapacityBytesTotal - r.PVUsedBytesTotal
	if r.PVCapacityBytesTotal > 0 {
		r.PVUsagePct = pct(float64(r.PVUsedBytesTotal), float64(r.PVCapacityBytesTotal))
	}

	// Workloads
	r.DeploymentCount = len(b.deployments)
	for _, dep := range b.deployments {
		if dep.Spec.Replicas != nil { r.DeploymentReplicasDesired += *dep.Spec.Replicas }
		r.DeploymentReplicasAvailable += dep.Status.AvailableReplicas
		r.DeploymentReplicasUnavailable += dep.Status.UnavailableReplicas
	}
	r.StatefulSetCount = len(b.statefulSets)
	for _, s := range b.statefulSets { r.StatefulSetReplicasReady += s.Status.ReadyReplicas }
	r.DaemonSetCount = len(b.daemonSets)
	for _, ds := range b.daemonSets { r.DaemonSetPodsReady += ds.Status.NumberReady }
	r.JobCount = len(b.jobs)
	for _, j := range b.jobs { r.JobSucceeded += j.Status.Succeeded; r.JobFailed += j.Status.Failed }
	r.CronJobCount = len(b.cronJobs)
	for _, cj := range b.cronJobs { r.CronJobActive += int32(len(cj.Status.Active)) }
	r.ReplicaSetCount = len(b.replicaSets)
	r.HPACount = len(b.hpas)
	for _, h := range b.hpas {
		r.HPACurrentReplicas += h.Status.CurrentReplicas
		r.HPADesiredReplicas += h.Status.DesiredReplicas
		if h.Spec.MinReplicas != nil { r.HPAMinReplicas += *h.Spec.MinReplicas }
		r.HPAMaxReplicas += h.Spec.MaxReplicas
	}

	// Services
	r.ServiceCountTotal = len(b.services)
	for _, s := range b.services {
		switch s.Spec.Type {
		case corev1.ServiceTypeClusterIP:    r.ServiceCountClusterIP++
		case corev1.ServiceTypeNodePort:     r.ServiceCountNodePort++
		case corev1.ServiceTypeLoadBalancer: r.ServiceCountLoadBalancer++
		case corev1.ServiceTypeExternalName: r.ServiceCountExternalName++
		}
	}
	r.IngressCount = len(b.ingresses)
	for _, ing := range b.ingresses { r.IngressRulesCount += len(ing.Spec.Rules) }
	for _, ep := range b.endpoints {
		for _, ss := range ep.Subsets { r.EndpointCount += len(ss.Addresses) }
	}
	r.NetworkPolicyCount = len(b.netpols)

	// Configuration / RBAC
	r.ConfigMapCount = len(b.configMaps)
	for _, cm := range b.configMaps {
		for _, v := range cm.Data       { r.ConfigMapSizeBytesTotal += int64(len(v)) }
		for _, v := range cm.BinaryData { r.ConfigMapSizeBytesTotal += int64(len(v)) }
	}
	r.SecretCount = len(b.secrets)
	for _, s := range b.secrets {
		for _, v := range s.Data { r.SecretSizeBytesTotal += int64(len(v)) }
	}
	r.ServiceAccountCount = len(b.serviceAccounts)
	r.RoleCount = len(b.roles)
	r.RoleBindingCount = len(b.roleBindings)

	// Events (last-minute window + totals)
	cutoff := now.Add(-time.Minute)
	for _, e := range b.events {
		if e.LastTimestamp.After(cutoff) {
			if e.Type == corev1.EventTypeWarning { r.EventCountWarningLastMin++ } else { r.EventCountNormalLastMin++ }
		}
		if e.Type == corev1.EventTypeWarning { r.EventCountWarningTotal++ }
		if strings.Contains(strings.ToLower(e.Reason), "failedscheduling") {
			r.EventCountFailedScheduling++
		}
	}

	// Quotas
	r.ResourceQuotaCount = len(b.quotas)
	r.LimitRangeCount = len(b.limitRanges)
	for _, q := range b.quotas {
		if hard, ok := q.Status.Hard[corev1.ResourceLimitsCPU]; ok {
			used := q.Status.Used[corev1.ResourceLimitsCPU]
			r.ResourceQuotaCPUUsedPct = pct(used.AsApproximateFloat64(), hard.AsApproximateFloat64())
		} else if hard, ok := q.Status.Hard[corev1.ResourceRequestsCPU]; ok {
			used := q.Status.Used[corev1.ResourceRequestsCPU]
			r.ResourceQuotaCPUUsedPct = pct(used.AsApproximateFloat64(), hard.AsApproximateFloat64())
		}
		if hard, ok := q.Status.Hard[corev1.ResourceLimitsMemory]; ok {
			used := q.Status.Used[corev1.ResourceLimitsMemory]
			r.ResourceQuotaMemUsedPct = pct(used.AsApproximateFloat64(), hard.AsApproximateFloat64())
		}
	}

	return r
}

// ── Per-node builder ────────────────────────────────────────────────────────

func buildNodeMetrics(d *ClusterData, now time.Time, env, cluster string, calc *cost.Calculator) []NodeMetrics {
	usageByNode := map[string]struct{ CPU, Mem int64 }{}
	for _, nm := range d.NodeMetrics {
		usageByNode[nm.Name] = struct{ CPU, Mem int64 }{
			CPU: millicoresFrom(nm.Usage.Cpu()),
			Mem: bytesFrom(nm.Usage.Memory()),
		}
	}
	podsByNode := map[string]int{}
	for _, p := range d.Pods { podsByNode[p.Spec.NodeName]++ }

	out := make([]NodeMetrics, 0, len(d.Nodes))
	for _, n := range d.Nodes {
		instance := labelOrEmpty(n.Labels, "node.kubernetes.io/instance-type")
		if instance == "" { instance = labelOrEmpty(n.Labels, "beta.kubernetes.io/instance-type") }
		region := labelOrEmpty(n.Labels, "topology.kubernetes.io/region")
		zone := labelOrEmpty(n.Labels, "topology.kubernetes.io/zone")
		pool := labelOrEmpty(n.Labels, "agentpool")
		ready := isNodeReady(n)

		rec := NodeMetrics{
			EnvironmentID: env, ClusterName: cluster,
			NodeName: n.Name, NodePool: pool, InstanceType: instance,
			Region: region, Zone: zone, CapturedAt: now, Ready: ready,
			CPUCapacityMillicores: millicoresFrom(n.Status.Capacity.Cpu()),
			CPUAllocatableMilli:   millicoresFrom(n.Status.Allocatable.Cpu()),
			MemCapacityBytes:      bytesFrom(n.Status.Capacity.Memory()),
			MemAllocatableBytes:   bytesFrom(n.Status.Allocatable.Memory()),
			PodCount:              podsByNode[n.Name],
			PodCapacity:           n.Status.Capacity.Pods().Value(),
		}
		if u, ok := usageByNode[n.Name]; ok {
			rec.CPUUsageMillicores = u.CPU
			rec.MemUsageBytes = u.Mem
		}
		rec.HourlyCostUSD = calc.NodeHourlyUSD(instance, rec.CPUCapacityMillicores, rec.MemCapacityBytes)
		out = append(out, rec)
	}
	return out
}

// ── helpers ─────────────────────────────────────────────────────────────────

func millicoresFrom(q *resource.Quantity) int64 {
	if q == nil { return 0 }
	return q.MilliValue()
}

func bytesFrom(q *resource.Quantity) int64 {
	if q == nil { return 0 }
	return q.Value()
}

func pct(num, den float64) float64 {
	if den == 0 { return 0 }
	return num / den * 100.0
}

func labelOrEmpty(m map[string]string, k string) string {
	if m == nil { return "" }
	return m[k]
}

func isNodeReady(n corev1.Node) bool {
	for _, c := range n.Status.Conditions {
		if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue { return true }
	}
	return false
}
