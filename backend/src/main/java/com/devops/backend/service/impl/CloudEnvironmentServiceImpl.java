package com.devops.backend.service.impl;

import com.devops.backend.config.CloudEnvironmentSeeder;
import com.devops.backend.model.environment.CloudEnvironment;
import com.devops.backend.model.environment.CloudEnvironment.AksNodeSpec;
import com.devops.backend.model.environment.CloudEnvironment.CategoryGroup;
import com.devops.backend.model.environment.CloudEnvironment.CategoryServiceItem;
import com.devops.backend.model.monitoring.AzurePriceRecord;
import com.devops.backend.repository.AzurePriceRecordRepository;
import com.devops.backend.repository.CloudEnvironmentRepository;
import com.devops.backend.service.CloudEnvironmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CloudEnvironmentServiceImpl implements CloudEnvironmentService {

    private final CloudEnvironmentRepository repo;
    private final AzurePriceRecordRepository priceRepo;

    @Override
    public List<CloudEnvironment> list() {
        return repo.findAllByOrderByNameAsc();
    }

    @Override
    public Optional<CloudEnvironment> findById(String id) {
        return repo.findById(id);
    }

    @Override
    public Optional<CloudEnvironment> findByName(String name) {
        return repo.findByNameIgnoreCase(name);
    }

    @Override
    public CloudEnvironment create(CloudEnvironment body, String actor) {
        if (body.getName() == null || body.getName().isBlank()) {
            throw new IllegalArgumentException("Environment name is required");
        }
        if (repo.existsByNameIgnoreCase(body.getName())) {
            throw new IllegalArgumentException("Environment '" + body.getName() + "' already exists");
        }
        body.setId(null);
        body.setCreatedAt(Instant.now());
        body.setCreatedBy(actor);
        body.setUpdatedAt(Instant.now());
        body.setUpdatedBy(actor);
        normalize(body);
        validateServiceUniqueness(body);
        applyPricing(body);
        return repo.save(body);
    }

    @Override
    public CloudEnvironment update(String id, CloudEnvironment body, String actor) {
        CloudEnvironment existing = repo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Environment " + id + " not found"));
        body.setId(id);
        body.setCreatedAt(existing.getCreatedAt());
        body.setCreatedBy(existing.getCreatedBy());
        body.setUpdatedAt(Instant.now());
        body.setUpdatedBy(actor);
        normalize(body);
        validateServiceUniqueness(body);
        applyPricing(body);
        return repo.save(body);
    }

    /** Default provider/sharedScope/categoryGroups + service IDs so docs stay well-formed. */
    private void normalize(CloudEnvironment env) {
        if (env.getProvider() == null || env.getProvider().isBlank()) {
            env.setProvider(CloudEnvironmentSeeder.PROVIDER_AZURE);
        }
        if (env.getSharedScope() == null) env.setSharedScope(false);
        if (env.getCategoryGroups() == null) env.setCategoryGroups(new ArrayList<>());

        for (CategoryGroup g : env.getCategoryGroups()) {
            if (g.getServices() == null) continue;
            for (CategoryServiceItem s : g.getServices()) {
                if (s.getId() == null || s.getId().isBlank()) s.setId(UUID.randomUUID().toString());
                if (s.getCount() == null || s.getCount() < 1) s.setCount(1);
                if (s.getAksNodes() == null) s.setAksNodes(new ArrayList<>());
            }
        }
    }

    /**
     * Enforce that within a single environment+category no two services share
     * a (case-insensitive) name. This implements the "service can be added only
     * once" rule — count is used to multiply, not duplicate.
     */
    private void validateServiceUniqueness(CloudEnvironment env) {
        if (env.getCategoryGroups() == null) return;
        for (CategoryGroup g : env.getCategoryGroups()) {
            if (g == null || g.getServices() == null) continue;
            Set<String> seen = new HashSet<>();
            for (CategoryServiceItem s : g.getServices()) {
                if (s == null || s.getName() == null) continue;
                String key = s.getName().toLowerCase(Locale.ROOT).trim();
                if (!seen.add(key)) {
                    throw new IllegalArgumentException(
                            "Service '" + s.getName() + "' is already configured in category '"
                                    + g.getDisplayName() + "' for environment '" + env.getName()
                                    + "'. Increase the count instead of adding it twice.");
                }
            }
        }
    }

    @Override
    public void delete(String id) {
        repo.deleteById(id);
    }

    @Override
    public int applyLatestPrices() {
        int updated = 0;
        for (CloudEnvironment env : repo.findAll()) {
            if (applyPricing(env)) {
                env.setUpdatedAt(Instant.now());
                repo.save(env);
                updated++;
            }
        }
        return updated;
    }

    /** Fill hourly rates on node pools, infra, and shared services from cached Azure prices. */
    private boolean applyPricing(CloudEnvironment env) {
        boolean changed = false;
        if (env.getSystemNodePool() != null) changed |= applyNodePool(env.getSystemNodePool());
        if (env.getUserNodePool() != null)   changed |= applyNodePool(env.getUserNodePool());
        if (env.getAdditionalNodePools() != null) {
            for (CloudEnvironment.NodePoolConfig pool : env.getAdditionalNodePools()) {
                if (pool != null) changed |= applyNodePool(pool);
            }
        }
        changed |= applyInfra(env.getIngress());
        changed |= applyInfra(env.getLoadBalancer());
        changed |= applyInfra(env.getContainerRegistry());
        changed |= applyInfra(env.getDomain());
        changed |= applyInfra(env.getKeyVault());
        changed |= applyInfra(env.getStorage());
        if (env.getSharedServices() != null) {
            for (CloudEnvironment.SharedEnvService s : env.getSharedServices()) {
                changed |= applyShared(s);
            }
        }
        // New structured catalog
        if (env.getCategoryGroups() != null) {
            for (CategoryGroup g : env.getCategoryGroups()) {
                if (g == null || g.getServices() == null) continue;
                for (CategoryServiceItem s : g.getServices()) {
                    changed |= applyCategoryService(s);
                }
            }
        }
        return changed;
    }

    private boolean applyCategoryService(CategoryServiceItem s) {
        if (s == null) return false;
        boolean changed = false;
        if (s.getAzureMeterId() != null && !s.getAzureMeterId().isBlank()) {
            Optional<AzurePriceRecord> row = priceRepo.findByMeterId(s.getAzureMeterId());
            if (row.isPresent()) {
                AzurePriceRecord r = row.get();
                Double hourly = CostMonitoringServiceImpl.normaliseToHourly(
                        r.getRetailPrice(), r.getUnitOfMeasure());
                if (hourly != null) {
                    s.setAzureRetailPriceUsd(r.getRetailPrice());
                    s.setAzureUnitOfMeasure(r.getUnitOfMeasure());
                    s.setAzureSkuName(r.getSkuName());
                    s.setAzureProductName(r.getProductName());
                    s.setAzureServiceName(r.getServiceName());
                    s.setAzureServiceFamily(r.getServiceFamily());
                    s.setAzureArmRegionName(r.getArmRegionName());
                    s.setHourlyRateUsd(hourly);
                    s.setMonthlyRateUsd(hourly * 730.0);
                    s.setLastPriceFetchedAt(Instant.now());
                    changed = true;
                }
            }
        }
        // AKS composite — refresh sub-node prices too
        if (s.getAksNodes() != null) {
            for (AksNodeSpec node : s.getAksNodes()) {
                changed |= applyAksNode(node);
            }
        }
        return changed;
    }

    private boolean applyAksNode(AksNodeSpec node) {
        if (node == null || node.getAzureMeterId() == null || node.getAzureMeterId().isBlank()) return false;
        Optional<AzurePriceRecord> row = priceRepo.findByMeterId(node.getAzureMeterId());
        if (row.isEmpty()) return false;
        AzurePriceRecord r = row.get();
        Double hourly = CostMonitoringServiceImpl.normaliseToHourly(
                r.getRetailPrice(), r.getUnitOfMeasure());
        if (hourly == null) return false;
        node.setAzureRetailPriceUsd(r.getRetailPrice());
        node.setAzureUnitOfMeasure(r.getUnitOfMeasure());
        node.setAzureSkuName(r.getSkuName());
        node.setAzureProductName(r.getProductName());
        node.setHourlyRateUsd(hourly);
        node.setMonthlyRateUsd(hourly * 730.0);
        node.setLastPriceFetchedAt(Instant.now());
        return true;
    }

    private boolean applyNodePool(CloudEnvironment.NodePoolConfig pool) {
        if (pool == null || pool.getAzureMeterId() == null || pool.getAzureMeterId().isBlank()) return false;
        Optional<AzurePriceRecord> row = priceRepo.findByMeterId(pool.getAzureMeterId());
        if (row.isEmpty()) return false;
        AzurePriceRecord r = row.get();
        Double hourly = CostMonitoringServiceImpl.normaliseToHourly(r.getRetailPrice(), r.getUnitOfMeasure());
        if (hourly == null) return false;
        pool.setHourlyRateUsd(hourly);
        if (pool.getAzureSkuName() == null) pool.setAzureSkuName(r.getSkuName());
        return true;
    }

    private boolean applyInfra(CloudEnvironment.InfraResource res) {
        if (res == null || res.getAzureMeterId() == null || res.getAzureMeterId().isBlank()) return false;
        Optional<AzurePriceRecord> row = priceRepo.findByMeterId(res.getAzureMeterId());
        if (row.isEmpty()) return false;
        AzurePriceRecord r = row.get();
        Double hourly = CostMonitoringServiceImpl.normaliseToHourly(r.getRetailPrice(), r.getUnitOfMeasure());
        if (hourly == null) return false;
        res.setHourlyRateUsd(hourly);
        return true;
    }

    private boolean applyShared(CloudEnvironment.SharedEnvService s) {
        if (s == null || s.getAzureMeterId() == null || s.getAzureMeterId().isBlank()) return false;
        Optional<AzurePriceRecord> row = priceRepo.findByMeterId(s.getAzureMeterId());
        if (row.isEmpty()) return false;
        AzurePriceRecord r = row.get();
        Double hourly = CostMonitoringServiceImpl.normaliseToHourly(r.getRetailPrice(), r.getUnitOfMeasure());
        if (hourly == null) return false;
        s.setHourlyRateUsd(hourly);
        s.setMonthlyRateUsd(hourly * 730.0);
        return true;
    }
}
