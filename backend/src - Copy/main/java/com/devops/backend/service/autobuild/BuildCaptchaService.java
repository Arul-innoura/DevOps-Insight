package com.devops.backend.service.autobuild;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;

/**
 * Generates and verifies a 5-character text captcha bound to a code-cut request.
 * Lightweight (no image library); the frontend renders it as styled SVG so it
 * still requires a human to read it.
 */
@Service
public class BuildCaptchaService {

    /** Avoid visually ambiguous characters (0/O, 1/I/L). */
    private static final char[] ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int LENGTH = 5;
    private final SecureRandom random = new SecureRandom();

    /** Generate a fresh challenge string. */
    public String generate() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }

    /** Verify user input against the issued challenge (case-insensitive, trimmed). */
    public boolean verify(String issued, String submitted) {
        if (issued == null || submitted == null) return false;
        return issued.equalsIgnoreCase(submitted.trim());
    }
}
