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
 * A cached row from the public Azure Retail Pricing API
 * (https://prices.azure.com/api/retail/prices). Refreshed hourly by
 * {@link com.devops.backend.scheduler.AzurePricingScheduler}. Used as the
 * sole source of truth for Azure cloud service pricing — no static formulas.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "azure_price_records")
public class AzurePriceRecord {

    @Id
    private String id;

    /** Stable per-SKU key: meterId. Unique per price record. */
    @Indexed(unique = true)
    private String meterId;

    private String skuId;
    private String skuName;
    private String productId;
    private String productName;
    private String serviceName;
    private String serviceFamily;
    private String armRegionName;
    private String armSkuName;
    private String currencyCode;

    /** Retail price per unit (e.g. per hour, per GB). */
    private Double retailPrice;
    private Double unitPrice;
    private String unitOfMeasure;
    private String type;
    private Double tierMinimumUnits;
    private Boolean isPrimaryMeterRegion;

    private Instant effectiveStartDate;
    private Instant fetchedAt;
}
