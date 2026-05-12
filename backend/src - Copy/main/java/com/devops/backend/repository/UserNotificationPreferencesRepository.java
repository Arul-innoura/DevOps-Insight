package com.devops.backend.repository;

import com.devops.backend.model.UserNotificationPreferences;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserNotificationPreferencesRepository extends MongoRepository<UserNotificationPreferences, String> {
    Optional<UserNotificationPreferences> findByUserEmailIgnoreCase(String userEmail);
}
