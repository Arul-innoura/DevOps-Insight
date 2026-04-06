package com.devops.backend.repository;

import com.devops.backend.model.RotaState;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RotaStateRepository extends MongoRepository<RotaState, String> {
}
