package com.devops.backend.service.prometheus;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bind {@code app.prometheus.*} from application.yml.
 *
 * <p>YAML map binding via {@code @Value} on a {@code Map<String,String>} is
 * brittle (different Spring Boot versions parse it differently); using
 * {@code @ConfigurationProperties} is the supported way.
 */
@Configuration
@ConfigurationProperties(prefix = "app.prometheus")
@Data
public class PrometheusProperties {

    private boolean enabled = true;
    private Map<String, String> endpoints = new HashMap<>();
    private int pollSeconds = 30;
    private int discoveryMinutes = 10;
    private int requestTimeoutSeconds = 15;
    private String defaultRegion = "eastus";

    /**
     * AKS Control Plane SLA tier:
     *   - "free":     no charge (default)
     *   - "standard": Uptime SLA, ~$0.10/hr per cluster (~$73/month)
     */
    private String aksControlPlaneTier = "free";

    /**
     * Fraction of observed node NIC outbound traffic that is internet-bound
     * (billable Azure egress). The remainder is VNet-internal (free).
     * Default 0.05 = 5%. Raise if your cluster sends a lot of internet traffic.
     */
    private double egressInternetFraction = 0.05;

    /**
     * Per-environment cloud provider: "azure" (default) or "aws".
     * Example YAML:
     *   app.prometheus.cloud-providers.dev: aws
     *   app.prometheus.cloud-providers.qa:  azure
     */
    private Map<String, String> cloudProviders = new HashMap<>();

    /**
     * Fixed cost extras — items the engine cannot directly observe via Prom
     * (Key Vault, Storage Accounts, MongoDB Atlas clusters, Jenkins VMs, …)
     * but that should be included in the "Fixed cost" inventory view.
     *
     * <p>Each extra can either set {@code monthlyUsd} explicitly or set
     * {@code autoPrice=true} to look up the live retail price for the SKU.
     */
    private List<FixedExtra> fixedCostExtras = new ArrayList<>();

    @Data
    public static class FixedExtra {
        /** category — database | cicd | keyvault | storageAccount | network | other */
        private String category = "other";
        private String name = "";
        private String sku = "";
        private int count = 1;
        /** Optional explicit monthly $ — wins over autoPrice when set. */
        private Double monthlyUsd;
        /** When true and {@code monthlyUsd} not set, look up the live Azure retail price. */
        private boolean autoPrice = false;
        /** Override region for the price lookup (defaults to {@link #defaultRegion}). */
        private String region;
        /** Free-form detail line shown in the UI. */
        private String detail;
    }
}
