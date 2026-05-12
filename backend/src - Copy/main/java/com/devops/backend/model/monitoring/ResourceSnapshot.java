package com.devops.backend.model.monitoring;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Time-series record of resource usage / allocation at a point in time.
 * Captured whenever project config changes, a DevOps manual snapshot is taken,
 * or the periodic capture job fires. Used to draw fluctuation graphs.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "resource_snapshots")
@CompoundIndexes({
        @CompoundIndex(name = "proj_env_time", def = "{'projectId': 1, 'environment': 1, 'capturedAt': -1}"),
        @CompoundIndex(name = "scope_time", def = "{'scope': 1, 'capturedAt': -1}")
})
public class ResourceSnapshot {

    @Id
    private String id;

    /** CLUSTER | PROJECT | MICROSERVICE | NODE_POOL */
    private String scope;

    private String projectId;
    private String environment;
    private String clusterName;
    private String microserviceId;
    private String microserviceName;

    /** Cumulative CPU cores allocated at this moment. */
    private Double cpuCores;

    /** Cumulative memory MB allocated at this moment. */
    private Double memoryMb;

    /** Optional — set for NODE_POOL scope. */
    private Integer nodeCount;
    private String nodeSize;

    private Instant capturedAt;

    /** AUTO | MANUAL | CONFIG_CHANGE */
    private String source;

    private String capturedBy;
}
