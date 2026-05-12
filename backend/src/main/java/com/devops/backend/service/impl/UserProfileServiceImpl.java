package com.devops.backend.service.impl;

import com.devops.backend.model.UserProfile;
import com.devops.backend.repository.UserProfileRepository;
import com.devops.backend.service.BlobStorageService;
import com.devops.backend.service.UserProfileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserProfileServiceImpl implements UserProfileService {

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final UserProfileRepository profileRepository;
    private final BlobStorageService blobStorageService;

    @Override
    public UserProfile getOrCreate(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email must not be blank");
        }
        String key = email.toLowerCase();
        return profileRepository.findByEmailIgnoreCase(key)
                .orElseGet(() -> profileRepository.save(UserProfile.builder()
                        .email(key)
                        .updatedAt(Instant.now())
                        .build()));
    }

    @Override
    public UserProfile update(String email, String bio, String dateOfBirth) {
        UserProfile p = getOrCreate(email);
        p.setBio(bio);

        if (dateOfBirth == null || dateOfBirth.isBlank()) {
            p.setDateOfBirth(null);
            p.setBirthMonthDay(null);
        } else {
            // Validate format strictly to avoid bad data
            LocalDate parsed;
            try {
                parsed = LocalDate.parse(dateOfBirth, ISO_DATE);
            } catch (Exception e) {
                throw new IllegalArgumentException("dateOfBirth must be in yyyy-MM-dd format");
            }
            p.setDateOfBirth(parsed.format(ISO_DATE));
            p.setBirthMonthDay(String.format("%02d-%02d", parsed.getMonthValue(), parsed.getDayOfMonth()));
        }

        p.setUpdatedAt(Instant.now());
        return profileRepository.save(p);
    }

    @Override
    public String uploadAvatar(String email, MultipartFile file) {
        try {
            UserProfile p = getOrCreate(email);
            // Best-effort cleanup of the previous avatar blob
            if (p.getProfilePicUrl() != null) {
                blobStorageService.deleteAttachment(p.getProfilePicUrl());
            }
            String url = blobStorageService.uploadProfilePicture(email, file);
            p.setProfilePicUrl(url);
            p.setUpdatedAt(Instant.now());
            profileRepository.save(p);
            return url;
        } catch (IOException e) {
            throw new RuntimeException("Failed to upload avatar: " + e.getMessage(), e);
        }
    }

    @Override
    public void removeAvatar(String email) {
        UserProfile p = getOrCreate(email);
        if (p.getProfilePicUrl() != null) {
            blobStorageService.deleteAttachment(p.getProfilePicUrl());
            p.setProfilePicUrl(null);
            p.setUpdatedAt(Instant.now());
            profileRepository.save(p);
        }
    }
}
