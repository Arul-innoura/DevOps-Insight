/**
 * PrometheusLiveCostPanel — thin wrapper kept for backward-compatibility.
 *
 * Both Admin and DevOps sidebars import this. It now re-exports the unified
 * CostManagementDashboard so both roles see the single-tab filter-driven view.
 *
 * The older ClusterCostDashboard (Overview/System/Projects/Resources/Cost
 * Analysis sub-pages) is still present in this directory but is no longer
 * the entry point for the "Cost Management" sidebar item.
 */
import CostManagementDashboard from "../CostManagementDashboard";
export default CostManagementDashboard;
