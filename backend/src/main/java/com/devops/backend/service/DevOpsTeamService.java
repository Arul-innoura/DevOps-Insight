package com.devops.backend.service;

import com.devops.backend.dto.AvailabilityUpdateRequest;
import com.devops.backend.dto.DevOpsMemberRequest;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.model.StatusChangeLog;

import java.time.Instant;
import java.util.List;

public interface DevOpsTeamService {
    List<DevOpsMember> getAllMembers();
    DevOpsMember addMember(DevOpsMemberRequest request, String actorName, String actorEmail);
    DevOpsMember upsertMember(DevOpsMemberRequest request, String actorName, String actorEmail);
    DevOpsMember updateAvailability(String email, AvailabilityUpdateRequest request, String actorName, String actorEmail);

    /** Record a heartbeat from the frontend to prove the user is still active. */
    DevOpsMember heartbeat(String email);

    /** Get status change logs for all members within a date range. */
    List<StatusChangeLog> getStatusTimeline(Instant from, Instant to);

    /** Get status change logs for a specific member within a date range. */
    List<StatusChangeLog> getMemberTimeline(String email, Instant from, Instant to);
}
