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

    /** Used to allocate the next sequence for ids like {@code EH-ENVUP-PRO-000001}. */
    List<Ticket> findByIdStartingWith(String idPrefix);
    
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
    
    /**
     * Full-text style search on active tickets. {@code ?0} must be a safe regex (e.g. from {@link java.util.regex.Pattern#quote} wrapped in .*).
     */
    @Query("{ '$and': [ { 'deleted': { $ne: true } }, { '$or': [ " +
           "{ 'productName': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'description': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'id': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'requestedBy': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'requesterEmail': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'assignedTo': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'assignedToEmail': { '$regex': ?0, '$options': 'i' } } " +
           "] } ] }")
    List<Ticket> searchTickets(String regexPattern);

    /**
     * Search only tickets raised by the given requester (email match, case-insensitive via regex {@code ?1}).
     */
    @Query("{ '$and': [ { 'deleted': { $ne: true } }, { 'requesterEmail': { '$regex': ?1, '$options': 'i' } }, { '$or': [ " +
           "{ 'productName': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'description': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'id': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'requestedBy': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'requesterEmail': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'assignedTo': { '$regex': ?0, '$options': 'i' } }, " +
           "{ 'assignedToEmail': { '$regex': ?0, '$options': 'i' } } " +
           "] } ] }")
    List<Ticket> searchMyTickets(String regexPattern, String requesterEmailRegex);
    
    // Find tickets created between dates
    List<Ticket> findByCreatedAtBetweenOrderByCreatedAtDesc(Instant start, Instant end);
    
    // Complex query for filtering
    @Query("{ " +
           "$and: [ " +
           "  { 'deleted': { $ne: true } }, " +
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

    /** Not soft-deleted ({@code deleted} absent or not {@code true}); legacy documents without the field match. */
    @Query(value = "{ 'deleted': { $ne: true } }", sort = "{ 'createdAt' : -1 }")
    List<Ticket> findActiveTicketsOrderByCreatedAtDesc();

    @Query(value = "{ 'deleted': true }", sort = "{ 'updatedAt' : -1 }")
    List<Ticket> findSoftDeletedTicketsOrderByUpdatedAtDesc();

    @Query(value = "{ 'requesterEmail': ?0, 'deleted': { $ne: true } }", sort = "{ 'createdAt' : -1 }")
    List<Ticket> findActiveByRequesterEmailOrderByCreatedAtDesc(String requesterEmail);

    @Query("{ 'status': { $in: ?0 }, 'deleted': { $ne: true } }")
    List<Ticket> findActiveByStatusIn(List<TicketStatus> statuses);

    @Query("{ 'assignedToEmail': ?0, 'deleted': { $ne: true } }")
    List<Ticket> findActiveByAssignedToEmail(String assignedToEmail);

    @Query("{ 'status': ?0, 'deleted': { $ne: true }, 'assignedTo': null }")
    List<Ticket> findActiveUnassignedByStatus(TicketStatus status);

    @Query(value = "{ 'deleted': { $ne: true } }", count = true)
    long countActiveTickets();

    @Query(value = "{ 'status': ?0, 'deleted': { $ne: true } }", count = true)
    long countActiveByStatus(TicketStatus status);

    @Query(value = "{ 'requestType': ?0, 'deleted': { $ne: true } }", count = true)
    long countActiveByRequestType(RequestType requestType);

    @Query(value = "{ 'environment': ?0, 'deleted': { $ne: true } }", count = true)
    long countActiveByEnvironment(Environment environment);

    @Query(value = "{ 'requesterEmail': ?0, 'deleted': { $ne: true } }", count = true)
    long countActiveByRequesterEmail(String requesterEmail);

}
