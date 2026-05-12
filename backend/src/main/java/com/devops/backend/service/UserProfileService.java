package com.devops.backend.service;

import com.devops.backend.model.UserProfile;
import org.springframework.web.multipart.MultipartFile;

public interface UserProfileService {

    /** Get the existing profile, or create an empty one keyed by email if none exists. */
    UserProfile getOrCreate(String email);

    /** Update bio and date-of-birth fields. Either may be null. */
    UserProfile update(String email, String bio, String dateOfBirth);

    /** Upload a new avatar (replaces any existing). Returns the public blob URL. */
    String uploadAvatar(String email, MultipartFile file);

    /** Remove the avatar and clear the stored URL. Caller falls back to initials. */
    void removeAvatar(String email);
}
