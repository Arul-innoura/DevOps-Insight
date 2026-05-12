package com.devops.backend.service;

import com.devops.backend.model.environment.CloudEnvironment;

import java.util.List;
import java.util.Optional;

/**
 * Admin-facing CRUD for {@link CloudEnvironment} — the managed Azure
 * environments that projects attach to.
 */
public interface CloudEnvironmentService {

    List<CloudEnvironment> list();

    Optional<CloudEnvironment> findById(String id);

    Optional<CloudEnvironment> findByName(String name);

    CloudEnvironment create(CloudEnvironment body, String actor);

    CloudEnvironment update(String id, CloudEnvironment body, String actor);

    void delete(String id);

    /**
     * Apply latest Azure retail prices to every node pool, infra resource,
     * and shared service on every environment. Safe to call on a schedule.
     *
     * @return count of fields refreshed
     */
    int applyLatestPrices();
}
