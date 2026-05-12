// Package pricing embeds an Azure VM list-price table so we never call out
// to a paid pricing API. Numbers are USD per hour for Linux pay-as-you-go in
// US East, captured 2024-Q4. Tune via env vars in production.
package pricing

import "strings"

// VMHourlyUSD maps Azure VM SKUs to their list price per hour. We expose
// this as a function so callers can fall back gracefully on unknown SKUs.
func VMHourlyUSD(instance string) (float64, bool) {
	if v, ok := vmTable[strings.ToLower(instance)]; ok {
		return v, true
	}
	return 0, false
}

// vmTable covers the families AKS most commonly uses. Adding a SKU is one
// line; missing SKUs fall back to per-resource pricing in the calculator.
var vmTable = map[string]float64{
	// D-series v3 (general purpose, common AKS default)
	"standard_d2s_v3":  0.096,
	"standard_d4s_v3":  0.192,
	"standard_d8s_v3":  0.384,
	"standard_d16s_v3": 0.768,
	"standard_d32s_v3": 1.536,
	"standard_d2_v3":   0.096,
	"standard_d4_v3":   0.192,
	"standard_d8_v3":   0.384,

	// D-series v5
	"standard_d2s_v5":  0.0960,
	"standard_d4s_v5":  0.1920,
	"standard_d8s_v5":  0.3840,
	"standard_d16s_v5": 0.7680,
	"standard_d2as_v5": 0.086,
	"standard_d4as_v5": 0.172,
	"standard_d8as_v5": 0.344,

	// B-series (burstable, AKS dev clusters)
	"standard_b2s":   0.0416,
	"standard_b2ms":  0.0832,
	"standard_b4ms":  0.1664,
	"standard_b8ms":  0.333,

	// E-series (memory optimised)
	"standard_e2s_v3": 0.126,
	"standard_e4s_v3": 0.252,
	"standard_e8s_v3": 0.504,
	"standard_e2s_v5": 0.126,
	"standard_e4s_v5": 0.252,
	"standard_e8s_v5": 0.504,

	// F-series (compute optimised)
	"standard_f2s_v2": 0.085,
	"standard_f4s_v2": 0.169,
	"standard_f8s_v2": 0.338,
}
