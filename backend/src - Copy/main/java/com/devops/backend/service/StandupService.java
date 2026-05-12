package com.devops.backend.service;

import com.devops.backend.dto.StandupNoteRequest;
import com.devops.backend.model.StandupNote;

import java.util.List;

public interface StandupService {
    List<StandupNote> getStandupNotes(String date);
    StandupNote addStandupNote(StandupNoteRequest request, String actorName, String actorEmail);
}
