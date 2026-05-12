package com.devops.backend.controller;

import com.devops.backend.model.UserProfile;
import com.devops.backend.service.UserProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class UserProfileController {

    private final UserProfileService userProfileService;

    @GetMapping("/me")
    public ResponseEntity<UserProfile> getMyProfile(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok(userProfileService.getOrCreate(extractEmail(jwt)));
    }

    @PutMapping("/me")
    public ResponseEntity<UserProfile> updateMyProfile(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody Map<String, String> body) {
        String bio = body.get("bio");
        String dateOfBirth = body.get("dateOfBirth");
        return ResponseEntity.ok(userProfileService.update(extractEmail(jwt), bio, dateOfBirth));
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> uploadAvatar(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile file) {
        String url = userProfileService.uploadAvatar(extractEmail(jwt), file);
        return ResponseEntity.ok(Map.of("url", url));
    }

    @DeleteMapping("/me/avatar")
    public ResponseEntity<Void> removeAvatar(@AuthenticationPrincipal Jwt jwt) {
        userProfileService.removeAvatar(extractEmail(jwt));
        return ResponseEntity.noContent().build();
    }

    /** Lookup another user's public profile (for displaying their avatar elsewhere in the UI). */
    @GetMapping("/by-email")
    public ResponseEntity<UserProfile> getByEmail(@RequestParam("email") String email) {
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(userProfileService.getOrCreate(email));
    }

    private static String extractEmail(Jwt jwt) {
        if (jwt == null) return "unknown@local";
        String email = jwt.getClaimAsString("preferred_username");
        if (email == null || email.isBlank()) email = jwt.getClaimAsString("email");
        return email != null ? email.toLowerCase() : "unknown@local";
    }
}
