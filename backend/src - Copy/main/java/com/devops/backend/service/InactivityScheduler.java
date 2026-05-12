package com.devops.backend.service;

import com.devops.backend.model.DevOpsAvailabilityStatus;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.repository.DevOpsMemberRepository;
import com.devops.backend.service.impl.DevOpsTeamServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Scheduled task that automatically marks DevOps engineers as OFFLINE
 * when they haven't sent a heartbeat in the last 15 minutes.
 * Runs every 60 seconds.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class InactivityScheduler {

    private final DevOpsMemberRepository memberRepository;
    private final DevOpsTeamServiceImpl devOpsTeamService;
    private final EventPublisherService eventPublisher;

    /** 15 minutes inactivity threshold */
    private static final long INACTIVITY_MINUTES = 15;

    @Scheduled(fixedRate = 60_000) // every 60 seconds
    public void checkInactiveMembers() {
        Instant threshold = Instant.now().minus(INACTIVITY_MINUTES, ChronoUnit.MINUTES);

        List<DevOpsMember> allMembers = memberRepository.findAll();

        for (DevOpsMember member : allMembers) {
            // Skip already-offline members
            if (member.getAvailability() == DevOpsAvailabilityStatus.OFFLINE) {
                continue;
            }

            // If no heartbeat ever recorded, or heartbeat is older than threshold
            Instant lastHb = member.getLastHeartbeat();
            if (lastHb == null || lastHb.isBefore(threshold)) {
                DevOpsAvailabilityStatus previousStatus = member.getAvailability();

                member.setAvailability(DevOpsAvailabilityStatus.OFFLINE);
                member.setUpdatedAt(Instant.now());
                member.setUpdatedBy("SYSTEM");
                memberRepository.save(member);

                // Log the status change
                devOpsTeamService.logStatusChange(
                        member,
                        previousStatus,
                        DevOpsAvailabilityStatus.OFFLINE,
                        "SYSTEM",
                        "inactivity_timeout"
                );

                // Broadcast via WebSocket so all dashboards update in real time
                eventPublisher.publishDevOpsTeamEvent("availability-updated", member);

                log.info("[InactivityScheduler] Auto-offlined {} (last heartbeat: {}, threshold: {})",
                        member.getName(), lastHb, threshold);
            }
        }
    }
}
