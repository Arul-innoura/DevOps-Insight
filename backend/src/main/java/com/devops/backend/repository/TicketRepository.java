package com.devops.backend.repository;

import com.devops.backend.model.Environment;
import com.devops.backend.model.RequestType;
import com.devops.backend.model.Ticket;
import com.devops.backend.model.TicketStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * MongoDB Repository for Ticket entities.
 */
@Repository
public interface TicketRepository extends MongoRepository<Ticket, String> {
    
    // Find by requester email
    List<Ticket> findByRequesterEmailOrderByCreatedAtDesc(String requesterEmail);
    Page<Ticket> findByRequesterEmail(String requesterEmail, Pageable pageable);
    
    // Find by status
    List<Ticket> findByStatusOrderByCreatedAtDesc(TicketStatus status);
    Page<Ticket> findByStatus(TicketStatus status, Pageable pageable);
    
    // Find by multiple statuses
    List<Ticket> findByStatusInOrderByCreatedAtDesc(List<TicketStatus> statuses);
    List<Ticket> findByStatusIn(List<TicketStatus> statuses);
    
    // Find by assignee
    List<Ticket> findByAssignedToOrderByCreatedAtDesc(String assignedTo);
    List<Ticket> findByAssignedToEmail(String assignedToEmail);
    List<Ticket> findByAssignedToIsNullAndStatus(TicketStatus status);
    
    // Find by environment
    List<Ticket> findByEnvironmentOrderByCreatedAtDesc(Environment environment);
    
    // Find by request type
    List<Ticket> findByRequestTypeOrderByCreatedAtDesc(RequestType requestType);
    
    // Count by status
    long countByStatus(TicketStatus status);
    
    // Count by request type
    long countByRequestType(RequestType requestType);
    
    // Count by environment
    long countByEnvironment(Environment environment);
    
    // Count by requester
    long countByRequesterEmail(String requesterEmail);
    
    // Search by product name or description
    @Query("{ '$or': [ " +
           "{ 'productName': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'description': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'id': { '$regex': ?0, '$options': 'i' } } " +
           "] }")
    List<Ticket> searchTickets(String searchTerm);
    
    // Find tickets created between dates
    List<Ticket> findByCreatedAtBetweenOrderByCreatedAtDesc(Instant start, Instant end);
    
    // Complex query for filtering
    @Query("{ " +
           "$and: [ " +
           "  { $or: [ { 'status': ?0 }, { ?0: null } ] }, " +
           "  { $or: [ { 'requestType': ?1 }, { ?1: null } ] }, " +
           "  { $or: [ { 'environment': ?2 }, { ?2: null } ] }, " +
           "  { $or: [ { 'requesterEmail': ?3 }, { ?3: null } ] } " +
           "] }")
    Page<Ticket> findWithFilters(TicketStatus status, RequestType requestType, 
                                  Environment environment, String requesterEmail, 
                                  Pageable pageable);
    
    // Find all ordered by created date
    List<Ticket> findAllByOrderByCreatedAtDesc();

    // Count tickets whose ID starts with a given prefix (used for sequential ID generation)
    long countByIdStartingWith(String prefix);
}
