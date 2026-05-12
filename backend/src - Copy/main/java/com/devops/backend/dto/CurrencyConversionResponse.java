package com.devops.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CurrencyConversionResponse {
    private double amount;
    private String fromCurrency;
    private String toCurrency;
    private double convertedAmount;
    private double exchangeRate;
    private String provider;
}

