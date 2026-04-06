package com.devops.backend.repository;

import com.devops.backend.model.DevOpsMember;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DevOpsMemberRepository extends MongoRepository<DevOpsMember, String> {
    Optional<DevOpsMember> findByEmailIgnoreCase(String email);
    List<DevOpsMember> findAllByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
    List<DevOpsMember> findAllByOrderByNameAsc();
}
