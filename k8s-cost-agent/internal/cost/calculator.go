// Package cost converts collected resource numbers into hourly/daily/monthly
// USD figures. It honours the operator-supplied price table and falls back
// to component-rate pricing when a VM SKU is unknown.
package cost

import "github.com/encipher/k8s-cost-agent/internal/pricing"

type Calculator struct {
	CPUPerHour   float64 // per vCPU-hour
	MemGBPerHour float64 // per GiB-hour
	StorageGBHr  float64 // per GiB-hour for managed disks (PV)
	EgressGB     float64 // per GiB internet egress (treated as per-hour rate here)
	LBPerHour    float64 // per LoadBalancer-hour
}

func New(cpu, mem, storage, egress, lb float64) *Calculator {
	return &Calculator{cpu, mem, storage, egress, lb}
}

// NodeHourlyUSD returns the per-hour cost for a node. If the SKU is in the
// pricing table we use list price; otherwise we sum component rates from
// the node's capacity (vCPU + RAM).
func (c *Calculator) NodeHourlyUSD(instance string, cpuMillicores int64, memBytes int64) float64 {
	if v, ok := pricing.VMHourlyUSD(instance); ok {
		return v
	}
	cpu := float64(cpuMillicores) / 1000.0
	mem := float64(memBytes) / (1024.0 * 1024.0 * 1024.0)
	return cpu*c.CPUPerHour + mem*c.MemGBPerHour
}

// NamespaceCost is the input we read from a record. Defined here so the
// cost package stays a leaf — collector imports cost, never the reverse.
type NamespaceCost struct {
	CPUMillicoresUsed int64
	MemBytesUsed      int64
	PVBytes           int64
	EgressBytes       uint64
	LBCount           int
}

// CostBreakdown is the output we write back to a record.
type CostBreakdown struct {
	CPU, Mem, Storage, Egress, PV, LB float64
	Total, Day, Month                 float64
}

// Applier is implemented by any record that can supply inputs and accept
// the computed breakdown. NamespaceMetrics in the collector package
// implements this — see collector/cost_shim.go.
type Applier interface {
	CostInputs() NamespaceCost
	SetCosts(CostBreakdown)
}

// ApplyNamespaceCost mutates the record in place with the computed costs.
//
// CPU / Mem / PV / LB are rates (USD per hour) — multiplying by 24 / 720
// gives day / month projections. Egress is a flow: cAdvisor exposes
// cumulative bytes since pod start, so the egress dollar figure is a
// cumulative-to-date amount. We keep it OUT of the per-hour rate to avoid
// the day/month projection compounding it. Consumers that want a true rate
// should compute deltas across two snapshots and divide by the interval.
func (c *Calculator) ApplyNamespaceCost(r Applier) {
	in := r.CostInputs()
	cpuCores := float64(in.CPUMillicoresUsed) / 1000.0
	memGB    := float64(in.MemBytesUsed) / (1024.0 * 1024.0 * 1024.0)
	pvGB     := float64(in.PVBytes) / (1024.0 * 1024.0 * 1024.0)
	egressGB := float64(in.EgressBytes) / (1024.0 * 1024.0 * 1024.0)

	out := CostBreakdown{
		CPU:     cpuCores * c.CPUPerHour,
		Mem:     memGB * c.MemGBPerHour,
		Storage: 0, // ephemeral storage isn't billed separately on AKS
		PV:      pvGB * c.StorageGBHr,
		Egress:  egressGB * c.EgressGB, // cumulative-to-date, NOT per hour
		LB:      float64(in.LBCount) * c.LBPerHour,
	}
	rate := out.CPU + out.Mem + out.Storage + out.PV + out.LB
	out.Total = rate            // hourly rate excludes cumulative egress
	out.Day   = rate * 24
	out.Month = rate * 24 * 30
	r.SetCosts(out)
}
