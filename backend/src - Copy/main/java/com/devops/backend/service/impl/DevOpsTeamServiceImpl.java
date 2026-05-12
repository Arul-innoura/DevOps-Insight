package com.devops.backend.service.impl;

import com.devops.backend.dto.AvailabilityUpdateRequest;
import com.devops.backend.dto.DevOpsMemberRequest;
import com.devops.backend.model.DevOpsAvailabilityStatus;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.model.StatusChangeLog;
import com.devops.backend.repository.DevOpsMemberRepository;
import com.devops.backend.repository.StatusChangeLogRepository;
import com.devops.backend.service.DevOpsTeamService;
import com.devops.backend.service.EventPublisherService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class DevOpsTeamServiceImpl implements DevOpsTeamService {

    private final DevOpsMemberRepository memberRepository;
    private final StatusChangeLogRepository statusChangeLogRepository;
    private final EventPublisherService eventPublisher;

    @Override
    public List<DevOpsMember> getAllMembers() {
        return memberRepository.findAllByOrderByNameAsc();
    }

    @Override
    public DevOpsMember addMember(DevOpsMemberRequest request, String actorName, String actorEmail) {
        String normalizedEmail = normalizeEmail(request.getEmail());
        if (memberRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new IllegalStateException("A DevOps member with this email already exists");
        }

        Instant now = Instant.now();
        DevOpsMember member = DevOpsMember.builder()
                .email(normalizedEmail)
                .name(request.getName().trim())
                .availability(request.getAvailability() != null ? request.getAvailability() : DevOpsAvailabilityStatus.AVAILABLE)
                .lastHeartbeat(now)
                .createdAt(now)
                .createdBy(resolveActor(actorName, actorEmail))
                .updatedAt(now)
                .updatedBy(resolveActor(actorName, actorEmail))
                .build();

        DevOpsMember saved = memberRepository.save(member);
        eventPublisher.publishDevOpsTeamEvent("member-added", saved);
        return saved;
    }

    @Override
    public DevOpsMember upsertMember(DevOpsMemberRequest request, String actorName, String actorEmail) {
        String normalizedEmail = normalizeEmail(request.getEmail());
        Instant now = Instant.now();
        DevOpsMember existing = findCanonicalMemberByEmail(normalizedEmail);

        if (existing == null) {
            DevOpsMember created = DevOpsMember.builder()
                    .email(normalizedEmail)
                    .name(request.getName().trim())
                    .availability(request.getAvailability() != null ? request.getAvailability() : DevOpsAvailabilityStatus.AVAILABLE)
                    .lastHeartbeat(now)
                    .createdAt(now)
                    .createdBy(resolveActor(actorName, actorEmail))
                    .updatedAt(now)
                    .updatedBy(resolveActor(actorName, actorEmail))
                    .build();
            try {
                DevOpsMember saved = memberRepository.save(created);
                eventPublisher.publishDevOpsTeamEvent("member-upserted", saved);
                return saved;
            } catch (DuplicateKeyException ex) {
                existing = findCanonicalMemberByEmail(normalizedEmail);
                if (existing == null) throw ex;
            }
        }

        existing.setName(request.getName().trim());
        if (request.getAvailability() != null) {
            existing.setAvailability(request.getAvailability());
        }
        existing.setLastHeartbeat(now);
        existing.setUpdatedAt(now);
        existing.setUpdatedBy(resolveActor(actorName, actorEmail));
        DevOpsMember saved = memberRepository.save(existing);
        eventPublisher.publishDevOpsTeamEvent("member-upserted", saved);
        return saved;
    }

    @Override
    public DevOpsMember updateAvailability(String email, AvailabilityUpdateRequest request, String actorName, String actorEmail) {
        DevOpsMember member = findCanonicalMemberByEmail(normalizeEmail(email));
        if (member == null) {
            throw new IllegalStateException("DevOps member not found");
        }

        DevOpsAvailabilityStatus previousStatus = member.getAvailability();
        DevOpsAvailabilityStatus newStatus = request.getAvailability();

        member.setAvailability(newStatus);
        member.setUpdatedAt(Instant.now());
        member.setUpdatedBy(resolveActor(actorName, actorEmail));

        // If coming back online, update heartbeat
        if (newStatus != DevOpsAvailabilityStatus.OFFLINE) {
            member.setLastHeartbeat(Instant.now());
        }

        DevOpsMember saved = memberRepository.save(member);

        // Log the status change for timeline tracking
        logStatusChange(saved, previousStatus, newStatus, resolveActor(actorName, actorEmail), "manual");

        eventPublisher.publishDevOpsTeamEvent("availability-updated", saved);
        return saved;
    }

    @Override
    public DevOpsMember heartbeat(String email) {
        DevOpsMember member = findCanonicalMemberByEmail(normalizeEmail(email));
        if (member == null) {
            log.debug("[Heartbeat] Member not found for email: {}", email);
            return null;
        }

        member.setLastHeartbeat(Instant.now());
        member.setUpdatedAt(Instant.now());
        return memberRepository.save(member);
    }

    @Override
    public List<StatusChangeLog> getStatusTimeline(Instant from, Instant to) {
        return statusChangeLogRepository.findByChangedAtBetweenOrderByChangedAtAsc(from, to);
    }

    @Override
    public List<StatusChangeLog> getMemberTimeline(String email, Instant from, Instant to) {
        return statusChangeLogRepository.findByMemberEmailIgnoreCaseAndChangedAtBetweenOrderByChangedAtAsc(
                normalizeEmail(email), from, to);
    }

    /**
     * Log a status change for the timeline audit trail.
     */
    public void logStatusChange(DevOpsMember member, DevOpsAvailabilityStatus previousStatus,
                                 DevOpsAvailabilityStatus newStatus, String changedBy, String changeReason) {
        if (previousStatus == newStatus) return; // No actual change

        StatusChangeLog logEntry = StatusChangeLog.builder()
                .memberEmail(member.getEmail())
                .memberName(member.getName())
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedBy(changedBy)
                .changeReason(changeReason)
                .changedAt(Instant.now())
                .build();

        statusChangeLogRepository.save(logEntry);
        log.info("[StatusLog] {} changed from {} to {} (reason: {}, by: {})",
                member.getName(), previousStatus, newStatus, changeReason, changedBy);
    }

    /**
     * Handles historical duplicate documents safely by selecting a canonical record.
     */
    private DevOpsMember findCanonicalMemberByEmail(String normalizedEmail) {
        List<DevOpsMember> members = memberRepository.findAllByEmailIgnoreCase(normalizedEmail);
        if (members == null || members.isEmpty()) return null;
        if (members.size() == 1) return members.get(0);

        return members.stream()
                .max(
                        Comparator.comparing(
                                        (DevOpsMember m) -> m.getUpdatedAt() != null ? m.getUpdatedAt() : Instant.EPOCH
                                )
                                .thenComparing(m -> m.getCreatedAt() != null ? m.getCreatedAt() : Instant.EPOCH)
                                .thenComparing(m -> m.getId() != null ? m.getId() : "")
                )
                .orElse(members.get(0));
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private String resolveActor(String actorName, String actorEmail) {
        if (actorName != null && !actorName.isBlank()) return actorName;
        if (actorEmail != null && !actorEmail.isBlank()) return actorEmail;
        return "System";
    }
}
