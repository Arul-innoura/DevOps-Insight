package com.devops.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live AWS EC2 / EKS pricing via the AWS Pricing API (SigV4 signed).
 *
 * <p>Used by {@link com.devops.backend.service.prometheus.PrometheusCostService}
 * for envs whose cloud-provider is configured as "aws".
 *
 * <p>Pricing hierarchy:
 * <ol>
 *   <li>Live AWS Pricing API (authenticated, cached 15 min).</li>
 *   <li>Hardcoded fallback table for common EKS instance types.</li>
 * </ol>
 */
@Service
@Slf4j
public class
AwsPricingService {

    private static final String PRICING_HOST    = "pricing.us-east-1.amazonaws.com";
    private static final String PRICING_ENDPOINT = "https://" + PRICING_HOST + "/";
    private static final String PRICING_REGION  = "us-east-1";
    private static final String PRICING_SERVICE = "pricing";
    private static final Duration CACHE_TTL     = Duration.ofMinutes(15);

    private record CachedPrice(double hourlyUsd, Instant expiry) {
        boolean fresh() { return Instant.now().isBefore(expiry); }
    }
    private final ConcurrentHashMap<String, CachedPrice> cache = new ConcurrentHashMap<>();

    private final String accessKey;
    private final String secretKey;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public AwsPricingService(
            @Value("${app.aws.access-key:}") String accessKey,
            @Value("${app.aws.secret-key:}") String secretKey) {
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(12))
                .build();
        if (accessKey == null || accessKey.isBlank()) {
            log.info("AWS pricing: no credentials configured — using built-in 2025 on-demand rates as fallback");
        } else {
            log.info("AWS pricing: credentials present — will query live API with fallback to built-in rates if pricing:GetProducts is not granted");
        }
    }

    public boolean isConfigured() {
        return accessKey != null && !accessKey.isBlank()
                && secretKey != null && !secretKey.isBlank();
    }

    /** On-demand hourly price for an EC2 instance type in the given AWS region. */
    public double lookupOnDemandPrice(String instanceType, String region) {
        if (instanceType == null || instanceType.isBlank()) return 0d;
        String normRegion = region == null || region.isBlank() ? "us-east-1" : region.toLowerCase();
        String cacheKey = instanceType + "|" + normRegion;

        CachedPrice cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.hourlyUsd();

        if (isConfigured()) {
            try {
                double price = fetchFromApi(instanceType, normRegion);
                if (price > 0) {
                    cache.put(cacheKey, new CachedPrice(price, Instant.now().plus(CACHE_TTL)));
                    return price;
                }
            } catch (Exception e) {
                log.warn("AWS pricing API failed for {} {} — using fallback: {}", instanceType, normRegion, e.getMessage());
            }
        }

        // Stale cache or static fallback
        if (cached != null) return cached.hourlyUsd();
        double fallback = FALLBACK_PRICES.getOrDefault(instanceType.toLowerCase(), 0d);
        if (fallback > 0) {
            cache.put(cacheKey, new CachedPrice(fallback, Instant.now().plus(CACHE_TTL)));
        }
        return fallback;
    }

    /** EBS volume monthly price per GB for a given storage class name. */
    public double ebsGbMonthly(String storageClass) {
        if (storageClass == null) return 0.10;
        String sc = storageClass.toLowerCase();
        if (sc.contains("io1") || sc.contains("io2")) return 0.125;
        if (sc.contains("gp3"))                        return 0.08;
        if (sc.contains("sc1"))                        return 0.025;  // cold HDD
        if (sc.contains("st1"))                        return 0.045;  // throughput HDD
        return 0.10; // gp2 / default
    }

    // ── AWS Pricing API (SigV4) ──────────────────────────────────────────────

    private double fetchFromApi(String instanceType, String region) throws Exception {
        String body = buildRequest(instanceType, regionToName(region));
        return callPricingApi(body, instanceType + " " + region);
    }

    /**
     * SigV4-signed POST to the AWS Pricing API endpoint.
     * Re-used by every service-specific lookup.
     */
    private double callPricingApi(String body, String logContext) throws Exception {
        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        String amzDate   = now.format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'"));
        String dateStamp = now.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String contentType = "application/x-amz-json-1.1";
        String xAmzTarget  = "AWSPriceListService.GetProducts";

        String payloadHash = hexSha256(body.getBytes(StandardCharsets.UTF_8));
        String canonicalHeaders =
                "content-type:" + contentType + "\n"
                + "host:" + PRICING_HOST + "\n"
                + "x-amz-date:" + amzDate + "\n"
                + "x-amz-target:" + xAmzTarget + "\n";
        String signedHeaders = "content-type;host;x-amz-date;x-amz-target";
        String canonicalRequest =
                "POST\n/\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;

        String credentialScope = dateStamp + "/" + PRICING_REGION + "/" + PRICING_SERVICE + "/aws4_request";
        String stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + credentialScope + "\n"
                + hexSha256(canonicalRequest.getBytes(StandardCharsets.UTF_8));

        byte[] signingKey = deriveSigningKey(secretKey, dateStamp, PRICING_REGION, PRICING_SERVICE);
        String signature  = bytesToHex(hmacSha256(signingKey, stringToSign));
        String authHeader = "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + credentialScope
                + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;

        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create(PRICING_ENDPOINT))
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .header("Content-Type", contentType)
                        .header("X-Amz-Date", amzDate)
                        .header("X-Amz-Target", xAmzTarget)
                        .header("Authorization", authHeader)
                        .timeout(Duration.ofSeconds(15))
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        if (resp.statusCode() == 403) {
            /* IAM user lacks pricing:GetProducts — harmless, fallback prices are used. */
            log.debug("AWS Pricing API: no permission for {} (add pricing:GetProducts to IAM policy for live rates, using accurate fallback)", logContext);
            return 0d;
        }
        if (resp.statusCode() != 200) {
            log.debug("AWS Pricing API returned HTTP {} for {} — using fallback", resp.statusCode(), logContext);
            return 0d;
        }
        return parsePrice(resp.body());
    }

    // ── Service-specific live price lookups ──────────────────────────────────

    /**
     * EKS managed control-plane hourly charge (per cluster).
     * Live from AWS Pricing API; published rate is $0.10/hr as fallback.
     */
    public double eksClusterHourly(String region) {
        String normRegion = region == null || region.isBlank() ? "us-east-1" : region.toLowerCase();
        String cacheKey = "eks-cluster|" + normRegion;
        CachedPrice cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.hourlyUsd();
        double fallback = 0.10;
        if (isConfigured()) {
            try {
                String body = "{\"ServiceCode\":\"AmazonEKS\","
                        + "\"Filters\":["
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"location\",\"Value\":\"" + esc(regionToName(normRegion)) + "\"}"
                        + "],\"MaxResults\":5,\"FormatVersion\":\"aws_v1\"}";
                double price = callPricingApi(body, "EKS cluster " + normRegion);
                if (price > 0) {
                    cache.put(cacheKey, new CachedPrice(price, Instant.now().plus(CACHE_TTL)));
                    return price;
                }
            } catch (Exception e) {
                log.warn("EKS pricing API failed for {} — using fallback ${}: {}", normRegion, fallback, e.getMessage());
            }
        }
        if (cached != null) return cached.hourlyUsd();
        cache.put(cacheKey, new CachedPrice(fallback, Instant.now().plus(CACHE_TTL)));
        return fallback;
    }

    /**
     * ALB/NLB base hourly charge per load balancer.
     * Live from AWS Pricing API; published rate is $0.018/hr as fallback.
     */
    public double albHourlyPerLb(String region) {
        String normRegion = region == null || region.isBlank() ? "us-east-1" : region.toLowerCase();
        String cacheKey = "alb-hourly|" + normRegion;
        CachedPrice cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.hourlyUsd();
        double fallback = 0.018;
        if (isConfigured()) {
            try {
                // ALB base charge is billed under AmazonEC2, group "ELB:Application Load Balancer"
                String body = "{\"ServiceCode\":\"AmazonEC2\","
                        + "\"Filters\":["
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"location\",\"Value\":\"" + esc(regionToName(normRegion)) + "\"},"
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"group\",\"Value\":\"ELB:Application Load Balancer\"}"
                        + "],\"MaxResults\":5,\"FormatVersion\":\"aws_v1\"}";
                double price = callPricingApi(body, "ALB " + normRegion);
                if (price > 0) {
                    cache.put(cacheKey, new CachedPrice(price, Instant.now().plus(CACHE_TTL)));
                    return price;
                }
            } catch (Exception e) {
                log.warn("ALB pricing API failed for {} — using fallback ${}: {}", normRegion, fallback, e.getMessage());
            }
        }
        if (cached != null) return cached.hourlyUsd();
        cache.put(cacheKey, new CachedPrice(fallback, Instant.now().plus(CACHE_TTL)));
        return fallback;
    }

    /**
     * Data-transfer-out rate per GB (after first 100 GB free tier).
     * Live from AWS Pricing API; published Zone-1 rate is $0.09/GB as fallback.
     */
    public double egressRatePerGb(String region) {
        String normRegion = region == null || region.isBlank() ? "us-east-1" : region.toLowerCase();
        String cacheKey = "egress-gb|" + normRegion;
        CachedPrice cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.hourlyUsd();
        double fallback = 0.09;
        if (isConfigured()) {
            try {
                String body = "{\"ServiceCode\":\"AWSDataTransfer\","
                        + "\"Filters\":["
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"fromLocationType\",\"Value\":\"AWS Region\"},"
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"toLocationType\",\"Value\":\"Internet\"},"
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"fromLocation\",\"Value\":\"" + esc(regionToName(normRegion)) + "\"}"
                        + "],\"MaxResults\":5,\"FormatVersion\":\"aws_v1\"}";
                double price = callPricingApi(body, "egress " + normRegion);
                if (price > 0) {
                    cache.put(cacheKey, new CachedPrice(price, Instant.now().plus(CACHE_TTL)));
                    return price;
                }
            } catch (Exception e) {
                log.warn("Egress pricing API failed for {} — using fallback ${}: {}", normRegion, fallback, e.getMessage());
            }
        }
        if (cached != null) return cached.hourlyUsd();
        cache.put(cacheKey, new CachedPrice(fallback, Instant.now().plus(CACHE_TTL)));
        return fallback;
    }

    /**
     * ECR data-storage rate per GB per month.
     * Live from AWS Pricing API; published rate is $0.10/GB-month as fallback.
     */
    public double ecrStoragePerGbMonth(String region) {
        String normRegion = region == null || region.isBlank() ? "us-east-1" : region.toLowerCase();
        String cacheKey = "ecr-storage|" + normRegion;
        CachedPrice cached = cache.get(cacheKey);
        if (cached != null && cached.fresh()) return cached.hourlyUsd();
        double fallback = 0.10;
        if (isConfigured()) {
            try {
                String body = "{\"ServiceCode\":\"AmazonECR\","
                        + "\"Filters\":["
                        + "{\"Type\":\"TERM_MATCH\",\"Field\":\"location\",\"Value\":\"" + esc(regionToName(normRegion)) + "\"}"
                        + "],\"MaxResults\":5,\"FormatVersion\":\"aws_v1\"}";
                double price = callPricingApi(body, "ECR storage " + normRegion);
                if (price > 0) {
                    cache.put(cacheKey, new CachedPrice(price, Instant.now().plus(CACHE_TTL)));
                    return price;
                }
            } catch (Exception e) {
                log.warn("ECR pricing API failed for {} — using fallback ${}: {}", normRegion, fallback, e.getMessage());
            }
        }
        if (cached != null) return cached.hourlyUsd();
        cache.put(cacheKey, new CachedPrice(fallback, Instant.now().plus(CACHE_TTL)));
        return fallback;
    }

    private String buildRequest(String instanceType, String location) {
        return "{\"ServiceCode\":\"AmazonEC2\","
                + "\"Filters\":["
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"instanceType\",\"Value\":\"" + esc(instanceType) + "\"},"
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"location\",\"Value\":\"" + esc(location) + "\"},"
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"operatingSystem\",\"Value\":\"Linux\"},"
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"preInstalledSw\",\"Value\":\"NA\"},"
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"tenancy\",\"Value\":\"Shared\"},"
                + "{\"Type\":\"TERM_MATCH\",\"Field\":\"capacitystatus\",\"Value\":\"Used\"}"
                + "],\"MaxResults\":1,\"FormatVersion\":\"aws_v1\"}";
    }

    /** Parse the AWS Pricing API response to extract the on-demand hourly USD price. */
    private double parsePrice(String responseBody) {
        try {
            JsonNode root      = mapper.readTree(responseBody);
            JsonNode priceList = root.path("priceList");
            if (!priceList.isArray() || priceList.isEmpty()) return 0d;

            // Each array element is a JSON string (not an embedded object)
            String priceJson  = priceList.get(0).asText();
            JsonNode pn       = mapper.readTree(priceJson);
            JsonNode onDemand = pn.path("terms").path("OnDemand");
            if (!onDemand.isObject()) return 0d;

            // Navigate terms.OnDemand.{termCode}.priceDimensions.{dimCode}.pricePerUnit.USD
            Iterator<JsonNode> terms = onDemand.elements();
            while (terms.hasNext()) {
                JsonNode term = terms.next();
                Iterator<JsonNode> dims = term.path("priceDimensions").elements();
                while (dims.hasNext()) {
                    JsonNode dim = dims.next();
                    String desc = dim.path("description").asText("").toLowerCase();
                    if (desc.contains("free")) continue;
                    String usd = dim.path("pricePerUnit").path("USD").asText("0");
                    double price = Double.parseDouble(usd);
                    if (price > 0) return price;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse AWS pricing JSON: {}", e.getMessage());
        }
        return 0d;
    }

    // ── SigV4 helpers ────────────────────────────────────────────────────────

    private static byte[] deriveSigningKey(String secret, String date, String region, String service) throws Exception {
        byte[] kDate    = hmacSha256(("AWS4" + secret).getBytes(StandardCharsets.UTF_8), date);
        byte[] kRegion  = hmacSha256(kDate, region);
        byte[] kService = hmacSha256(kRegion, service);
        return hmacSha256(kService, "aws4_request");
    }

    private static byte[] hmacSha256(byte[] key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private static String hexSha256(byte[] data) throws Exception {
        return bytesToHex(MessageDigest.getInstance("SHA-256").digest(data));
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    // ── Region display name map ───────────────────────────────────────────────

    private static String regionToName(String region) {
        return REGION_NAMES.getOrDefault(region.toLowerCase(), region);
    }

    private static final Map<String, String> REGION_NAMES = Map.ofEntries(
            Map.entry("us-east-1",      "US East (N. Virginia)"),
            Map.entry("us-east-2",      "US East (Ohio)"),
            Map.entry("us-west-1",      "US West (N. California)"),
            Map.entry("us-west-2",      "US West (Oregon)"),
            Map.entry("ca-central-1",   "Canada (Central)"),
            Map.entry("eu-west-1",      "EU (Ireland)"),
            Map.entry("eu-west-2",      "EU (London)"),
            Map.entry("eu-west-3",      "EU (Paris)"),
            Map.entry("eu-central-1",   "EU (Frankfurt)"),
            Map.entry("eu-north-1",     "EU (Stockholm)"),
            Map.entry("ap-south-1",     "Asia Pacific (Mumbai)"),
            Map.entry("ap-southeast-1", "Asia Pacific (Singapore)"),
            Map.entry("ap-southeast-2", "Asia Pacific (Sydney)"),
            Map.entry("ap-northeast-1", "Asia Pacific (Tokyo)"),
            Map.entry("ap-northeast-2", "Asia Pacific (Seoul)"),
            Map.entry("ap-east-1",      "Asia Pacific (Hong Kong)"),
            Map.entry("sa-east-1",      "South America (Sao Paulo)")
    );

    // ── Static fallback prices (on-demand Linux, us-east-1, as of 2025) ──────

    private static final Map<String, Double> FALLBACK_PRICES = new HashMap<>();
    static {
        // t3 family
        FALLBACK_PRICES.put("t3.nano",    0.0052);
        FALLBACK_PRICES.put("t3.micro",   0.0104);
        FALLBACK_PRICES.put("t3.small",   0.0208);
        FALLBACK_PRICES.put("t3.medium",  0.0416);
        FALLBACK_PRICES.put("t3.large",   0.0832);
        FALLBACK_PRICES.put("t3.xlarge",  0.1664);
        FALLBACK_PRICES.put("t3.2xlarge", 0.3328);
        // t3a family
        FALLBACK_PRICES.put("t3a.nano",    0.0047);
        FALLBACK_PRICES.put("t3a.micro",   0.0094);
        FALLBACK_PRICES.put("t3a.small",   0.0188);
        FALLBACK_PRICES.put("t3a.medium",  0.0376);
        FALLBACK_PRICES.put("t3a.large",   0.0752);
        FALLBACK_PRICES.put("t3a.xlarge",  0.1504);
        FALLBACK_PRICES.put("t3a.2xlarge", 0.3008);
        // m5 family
        FALLBACK_PRICES.put("m5.large",    0.096);
        FALLBACK_PRICES.put("m5.xlarge",   0.192);
        FALLBACK_PRICES.put("m5.2xlarge",  0.384);
        FALLBACK_PRICES.put("m5.4xlarge",  0.768);
        FALLBACK_PRICES.put("m5.8xlarge",  1.536);
        FALLBACK_PRICES.put("m5.12xlarge", 2.304);
        // m5a family
        FALLBACK_PRICES.put("m5a.large",   0.086);
        FALLBACK_PRICES.put("m5a.xlarge",  0.172);
        FALLBACK_PRICES.put("m5a.2xlarge", 0.344);
        FALLBACK_PRICES.put("m5a.4xlarge", 0.688);
        // m6i family
        FALLBACK_PRICES.put("m6i.large",   0.096);
        FALLBACK_PRICES.put("m6i.xlarge",  0.192);
        FALLBACK_PRICES.put("m6i.2xlarge", 0.384);
        FALLBACK_PRICES.put("m6i.4xlarge", 0.768);
        // m6g / Graviton
        FALLBACK_PRICES.put("m6g.large",   0.077);
        FALLBACK_PRICES.put("m6g.xlarge",  0.154);
        FALLBACK_PRICES.put("m6g.2xlarge", 0.308);
        FALLBACK_PRICES.put("m6g.4xlarge", 0.616);
        // c5 family
        FALLBACK_PRICES.put("c5.large",    0.085);
        FALLBACK_PRICES.put("c5.xlarge",   0.17);
        FALLBACK_PRICES.put("c5.2xlarge",  0.34);
        FALLBACK_PRICES.put("c5.4xlarge",  0.68);
        FALLBACK_PRICES.put("c5.9xlarge",  1.53);
        // c6i family
        FALLBACK_PRICES.put("c6i.large",   0.085);
        FALLBACK_PRICES.put("c6i.xlarge",  0.17);
        FALLBACK_PRICES.put("c6i.2xlarge", 0.34);
        FALLBACK_PRICES.put("c6i.4xlarge", 0.68);
        // r5 family
        FALLBACK_PRICES.put("r5.large",    0.126);
        FALLBACK_PRICES.put("r5.xlarge",   0.252);
        FALLBACK_PRICES.put("r5.2xlarge",  0.504);
        FALLBACK_PRICES.put("r5.4xlarge",  1.008);
        // r6i family
        FALLBACK_PRICES.put("r6i.large",   0.126);
        FALLBACK_PRICES.put("r6i.xlarge",  0.252);
        FALLBACK_PRICES.put("r6i.2xlarge", 0.504);
        // p3 GPU family
        FALLBACK_PRICES.put("p3.2xlarge",  3.06);
        FALLBACK_PRICES.put("p3.8xlarge",  12.24);
        // g4dn GPU family
        FALLBACK_PRICES.put("g4dn.xlarge",  0.526);
        FALLBACK_PRICES.put("g4dn.2xlarge", 0.752);
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
