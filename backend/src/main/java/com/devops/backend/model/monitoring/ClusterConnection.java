package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Stores the kubeconfig and connection state for one AKS cluster environment.
 * One document per CloudEnvironment that has real-cluster metrics enabled.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "cluster_connections")
public class ClusterConnection {

    @Id
    private String id;

    /** Foreign key to CloudEnvironment.id */
    @Indexed(unique = true)
    private String environmentId;

    private String environmentName;

    /**
     * Raw kubeconfig YAML content — obtained via:
     *   az aks get-credentials --resource-group <rg> --name <cluster> --file -
     */
    private String kubeconfigContent;

    /** Whether the last connection attempt succeeded. */
    @Builder.Default
    private boolean connected = false;

    private Instant lastConnectedAt;
    private String lastError;

    private Instant createdAt;
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
