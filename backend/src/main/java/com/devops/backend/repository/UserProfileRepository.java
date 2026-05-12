package com.devops.backend.repository;

import com.devops.backend.model.UserProfile;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface UserProfileRepository extends MongoRepository<UserProfile, String> {

    Optional<UserProfile> findByEmailIgnoreCase(String email);

    /** Returns every profile whose birthMonthDay matches (e.g. "03-15"). Used by daily scheduler. */
    List<UserProfile> findByBirthMonthDay(String birthMonthDay);
}
