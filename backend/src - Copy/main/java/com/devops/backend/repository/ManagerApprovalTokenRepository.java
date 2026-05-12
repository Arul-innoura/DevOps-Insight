package com.devops.backend.repository;

import com.devops.backend.model.ManagerApprovalToken;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ManagerApprovalTokenRepository extends MongoRepository<ManagerApprovalToken, String> {
    
    Optional<ManagerApprovalToken> findByToken(String token);
    
    Optional<ManagerApprovalToken> findByTicketIdAndUsedFalse(String ticketId);
    
    void deleteByTicketId(String ticketId);
}
