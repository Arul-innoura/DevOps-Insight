package com.devops.backend.dto.monitoring;

import com.devops.backend.model.workflow.ClusterInfrastructure;
import com.devops.backend.model.workflow.CloudServiceItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Detailed configuration shown in the hover / side-panel for a hierarchy node.
 * Populated differently depending on level:
 * <ul>
 *   <li>ENVIRONMENT / CLUSTER: node pools, ingress, cluster-level cloud services</li>
 *   <li>PROJECT: aggregate CPU / memory / cloud services</li>
 *   <li>MICROSERVICE: cpu range, ram range, notes</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResourceDetail {

    // Microservice-level
    private String cpuRange;
    private String ramRange;
    private String notes;
    private String clusterName;
    private String environment;

    // Cluster-level
    private ClusterInfrastructure clusterInfrastructure;

    // Cloud services attached at this level (redacted for non-DevOps)
    @Builder.Default
    private List<CloudServiceItem> cloudServices = new ArrayList<>();
}
