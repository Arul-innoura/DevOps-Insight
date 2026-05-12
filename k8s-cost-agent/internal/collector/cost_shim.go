package collector

import "github.com/encipher/k8s-cost-agent/internal/cost"

// CostInputs lets the cost package read what it needs from a NamespaceMetrics
// without importing this package back. See cost/calculator.go for the
// matching `applier` interface.
func (n *NamespaceMetrics) CostInputs() cost.NamespaceCost {
	return cost.NamespaceCost{
		CPUMillicoresUsed: n.CPUUsageMillicoresActual,
		MemBytesUsed:      n.MemoryUsageBytesActual,
		PVBytes:           n.PVUsedBytesTotal,
		EgressBytes:       n.NetworkEgressInternetBytes,
		LBCount:           n.ServiceCountLoadBalancer,
	}
}

func (n *NamespaceMetrics) SetCosts(b cost.CostBreakdown) {
	n.CostCPUPerHourUSD = b.CPU
	n.CostMemoryPerHourUSD = b.Mem
	n.CostStoragePerHourUSD = b.Storage
	n.CostNetworkEgressPerHrUSD = b.Egress
	n.CostPVPerHourUSD = b.PV
	n.CostLBPerHourUSD = b.LB
	n.CostTotalPerHourUSD = b.Total
	n.CostTotalPerDayUSD = b.Day
	n.CostTotalPerMonthUSD = b.Month
}
