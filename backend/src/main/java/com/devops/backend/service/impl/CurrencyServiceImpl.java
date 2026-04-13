package com.devops.backend.service.impl;

import com.devops.backend.dto.CurrencyConversionResponse;
import com.devops.backend.service.CurrencyService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
@Slf4j
public class CurrencyServiceImpl implements CurrencyService {

    private final RestClient restClient = RestClient.builder()
            .baseUrl("https://open.er-api.com")
            .build();

    @Override
    @SuppressWarnings("unchecked")
    public CurrencyConversionResponse convert(double amount, String fromCurrency, String toCurrency) {
        String from = normalize(fromCurrency);
        String to = normalize(toCurrency);
        if (from.equals(to)) {
            return CurrencyConversionResponse.builder()
                    .amount(amount)
                    .fromCurrency(from)
                    .toCurrency(to)
                    .convertedAmount(round2(amount))
                    .exchangeRate(1.0d)
                    .provider("open.er-api.com")
                    .build();
        }

        Map<String, Object> payload = restClient.get()
                .uri("/v6/latest/{base}", from)
                .retrieve()
                .body(Map.class);
        if (payload == null) {
            throw new IllegalStateException("Currency API returned empty response");
        }
        Object ratesObj = payload.get("rates");
        if (!(ratesObj instanceof Map<?, ?> rates)) {
            throw new IllegalStateException("Currency API response missing rates");
        }
        Object rateObj = rates.get(to);
        if (!(rateObj instanceof Number rateNumber)) {
            throw new IllegalArgumentException("Unsupported currency: " + to);
        }
        double rate = rateNumber.doubleValue();
        double converted = amount * rate;
        return CurrencyConversionResponse.builder()
                .amount(amount)
                .fromCurrency(from)
                .toCurrency(to)
                .convertedAmount(round2(converted))
                .exchangeRate(rate)
                .provider("open.er-api.com")
                .build();
    }

    private static String normalize(String c) {
        if (c == null || c.isBlank()) {
            return "USD";
        }
        String u = c.trim().toUpperCase();
        if ("RIAL".equals(u)) {
            return "QAR";
        }
        return u;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0d) / 100.0d;
    }
}

