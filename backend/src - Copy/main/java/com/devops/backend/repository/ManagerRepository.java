package com.devops.backend.repository;

import com.devops.backend.model.Manager;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ManagerRepository extends MongoRepository<Manager, String> {
    
    Optional<Manager> findByEmailIgnoreCase(String email);
    
    List<Manager> findByActiveTrue();
    
    boolean existsByEmailIgnoreCase(String email);
}
