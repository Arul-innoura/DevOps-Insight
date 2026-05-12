// cAdvisor scraping over the kubelet proxy. Gives us per-container CPU,
// memory, network, and filesystem counters without any external dependency.
//
// Endpoint: /api/v1/nodes/<node>/proxy/metrics/cadvisor (Prometheus text format)
//
// We aggregate across all nodes once per cycle, then expose lookups by
// (namespace, pod, container) for downstream collectors.

package kube

import (
	"context"
	"fmt"
	"strings"
	"sync"

	dto "github.com/prometheus/client_model/go"
	"github.com/prometheus/common/expfmt"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PodNet is per-pod aggregated network counters (sum across interfaces).
type PodNet struct {
	RxBytes, TxBytes     uint64
	RxPackets, TxPackets uint64
	RxErrors, TxErrors   uint64
	RxDropped, TxDropped uint64
}

// PodFS is per-pod filesystem usage from cAdvisor (sum across containers).
type PodFS struct {
	UsageBytes uint64
}

// PodCPU holds throttling counters which metrics-server does not expose.
type PodCPU struct {
	ThrottledSeconds float64
	ThrottledPeriods float64
}

// CAdvisorSnapshot is the result of one cluster-wide scrape.
type CAdvisorSnapshot struct {
	Net  map[podKey]PodNet
	FS   map[podKey]PodFS
	CPU  map[podKey]PodCPU
	Errs []error // non-fatal per-node errors (some nodes may be NotReady)
}

type podKey struct{ Namespace, Pod string }

// ScrapeCAdvisor fetches /metrics/cadvisor from every Ready node in parallel
// and parses the relevant counter families. Errors on individual nodes are
// captured in Errs but do not fail the whole scrape.
func (c *Clients) ScrapeCAdvisor(ctx context.Context) (*CAdvisorSnapshot, error) {
	nodes, err := c.Core.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list nodes: %w", err)
	}

	out := &CAdvisorSnapshot{
		Net: map[podKey]PodNet{},
		FS:  map[podKey]PodFS{},
		CPU: map[podKey]PodCPU{},
	}
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, n := range nodes.Items {
		if !isReady(n) {
			continue
		}
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			body, err := c.Core.CoreV1().RESTClient().Get().
				AbsPath("/api/v1/nodes/", name, "/proxy/metrics/cadvisor").
				DoRaw(ctx)
			if err != nil {
				mu.Lock()
				out.Errs = append(out.Errs, fmt.Errorf("node %s: %w", name, err))
				mu.Unlock()
				return
			}
			parsed, perr := parseCAdvisor(body)
			mu.Lock()
			defer mu.Unlock()
			if perr != nil {
				out.Errs = append(out.Errs, fmt.Errorf("parse %s: %w", name, perr))
				return
			}
			mergeSnapshot(out, parsed)
		}(n.Name)
	}
	wg.Wait()
	return out, nil
}

func isReady(n corev1.Node) bool {
	for _, c := range n.Status.Conditions {
		if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

// parseCAdvisor decodes the Prometheus text body and projects only the
// metric families we care about. Anything else is ignored to keep memory low.
func parseCAdvisor(body []byte) (*CAdvisorSnapshot, error) {
	parser := expfmt.TextParser{}
	families, err := parser.TextToMetricFamilies(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	out := &CAdvisorSnapshot{
		Net: map[podKey]PodNet{},
		FS:  map[podKey]PodFS{},
		CPU: map[podKey]PodCPU{},
	}

	for name, fam := range families {
		switch name {
		case "container_network_receive_bytes_total",
			"container_network_transmit_bytes_total",
			"container_network_receive_packets_total",
			"container_network_transmit_packets_total",
			"container_network_receive_errors_total",
			"container_network_transmit_errors_total",
			"container_network_receive_packets_dropped_total",
			"container_network_transmit_packets_dropped_total":
			collectNetwork(name, fam, out)
		case "container_fs_usage_bytes":
			collectFS(fam, out)
		case "container_cpu_cfs_throttled_seconds_total":
			collectCPUThrottle(fam, out, true)
		case "container_cpu_cfs_throttled_periods_total":
			collectCPUThrottle(fam, out, false)
		}
	}
	return out, nil
}

// network metrics are reported per-interface on the pod sandbox container.
// The pod sandbox has no `container` label (or container=""), and labels
// `pod` and `namespace` identify the pod.
func collectNetwork(metricName string, fam *dto.MetricFamily, out *CAdvisorSnapshot) {
	for _, m := range fam.Metric {
		ns, pod, container := lookupPodLabels(m)
		if ns == "" || pod == "" || container != "" {
			continue // skip per-app-container duplicates
		}
		v := uint64(m.GetCounter().GetValue())
		k := podKey{ns, pod}
		cur := out.Net[k]
		switch metricName {
		case "container_network_receive_bytes_total":
			cur.RxBytes += v
		case "container_network_transmit_bytes_total":
			cur.TxBytes += v
		case "container_network_receive_packets_total":
			cur.RxPackets += v
		case "container_network_transmit_packets_total":
			cur.TxPackets += v
		case "container_network_receive_errors_total":
			cur.RxErrors += v
		case "container_network_transmit_errors_total":
			cur.TxErrors += v
		case "container_network_receive_packets_dropped_total":
			cur.RxDropped += v
		case "container_network_transmit_packets_dropped_total":
			cur.TxDropped += v
		}
		out.Net[k] = cur
	}
}

func collectFS(fam *dto.MetricFamily, out *CAdvisorSnapshot) {
	for _, m := range fam.Metric {
		ns, pod, _ := lookupPodLabels(m)
		if ns == "" || pod == "" {
			continue
		}
		k := podKey{ns, pod}
		fs := out.FS[k]
		fs.UsageBytes += uint64(m.GetGauge().GetValue())
		out.FS[k] = fs
	}
}

func collectCPUThrottle(fam *dto.MetricFamily, out *CAdvisorSnapshot, isSeconds bool) {
	for _, m := range fam.Metric {
		ns, pod, _ := lookupPodLabels(m)
		if ns == "" || pod == "" {
			continue
		}
		k := podKey{ns, pod}
		cpu := out.CPU[k]
		v := m.GetCounter().GetValue()
		if isSeconds {
			cpu.ThrottledSeconds += v
		} else {
			cpu.ThrottledPeriods += v
		}
		out.CPU[k] = cpu
	}
}

func lookupPodLabels(m *dto.Metric) (ns, pod, container string) {
	for _, l := range m.Label {
		switch l.GetName() {
		case "namespace":
			ns = l.GetValue()
		case "pod":
			pod = l.GetValue()
		case "container":
			container = l.GetValue()
		}
	}
	return
}

func mergeSnapshot(dst, src *CAdvisorSnapshot) {
	for k, v := range src.Net {
		cur := dst.Net[k]
		cur.RxBytes += v.RxBytes
		cur.TxBytes += v.TxBytes
		cur.RxPackets += v.RxPackets
		cur.TxPackets += v.TxPackets
		cur.RxErrors += v.RxErrors
		cur.TxErrors += v.TxErrors
		cur.RxDropped += v.RxDropped
		cur.TxDropped += v.TxDropped
		dst.Net[k] = cur
	}
	for k, v := range src.FS {
		cur := dst.FS[k]
		cur.UsageBytes += v.UsageBytes
		dst.FS[k] = cur
	}
	for k, v := range src.CPU {
		cur := dst.CPU[k]
		cur.ThrottledSeconds += v.ThrottledSeconds
		cur.ThrottledPeriods += v.ThrottledPeriods
		dst.CPU[k] = cur
	}
}
