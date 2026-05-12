package com.devops.backend.controller;

import com.devops.backend.dto.CurrencyConversionResponse;
import com.devops.backend.service.CurrencyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/currency")
@RequiredArgsConstructor
public class CurrencyController {

    private final CurrencyService currencyService;

    @GetMapping("/convert")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<CurrencyConversionResponse> convert(
            @RequestParam double amount,
            @RequestParam String from,
            @RequestParam String to) {
        return ResponseEntity.ok(currencyService.convert(amount, from, to));
    }
}

