package com.devops.backend.service.impl;

import com.devops.backend.dto.StandupNoteRequest;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.model.StandupNote;
import com.devops.backend.model.StandupUpdate;
import com.devops.backend.repository.DevOpsMemberRepository;
import com.devops.backend.repository.StandupNoteRepository;
import com.devops.backend.service.StandupService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StandupServiceImpl implements StandupService {

    private final StandupNoteRepository standupNoteRepository;
    private final DevOpsMemberRepository devOpsMemberRepository;

    @Override
    public List<StandupNote> getStandupNotes(String date) {
        if (date != null && !date.isBlank()) {
            return standupNoteRepository.findByDateOrderByCreatedAtDesc(date);
        }
        return standupNoteRepository.findAllByOrderByDateDescCreatedAtDesc();
    }

    @Override
    public StandupNote addStandupNote(StandupNoteRequest request, String actorName, String actorEmail) {
        List<DevOpsMember> members = devOpsMemberRepository.findAllByOrderByNameAsc();
        Map<String, String> updateMap = request.getUpdates() != null ? request.getUpdates() : Map.of();

        List<StandupUpdate> updates = new ArrayList<>();
        for (DevOpsMember member : members) {
            String key = member.getEmail() != null ? member.getEmail().toLowerCase() : "";
            updates.add(StandupUpdate.builder()
                    .memberEmail(member.getEmail())
                    .memberName(member.getName())
                    .statusUpdate(updateMap.getOrDefault(key, ""))
                    .build());
        }

        StandupNote note = StandupNote.builder()
                .date(request.getDate())
                .summary(request.getSummary() != null ? request.getSummary().trim() : "")
                .updates(updates)
                .createdAt(Instant.now())
                .createdBy(actorName)
                .createdByEmail(actorEmail)
                .build();

        return standupNoteRepository.save(note);
    }
}
