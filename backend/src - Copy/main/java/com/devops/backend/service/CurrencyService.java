package com.devops.backend.service;

import com.devops.backend.dto.CurrencyConversionResponse;

public interface CurrencyService {
    CurrencyConversionResponse convert(double amount, String fromCurrency, String toCurrency);
}

