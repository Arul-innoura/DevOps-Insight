package com.devops.backend.service;

import com.devops.backend.dto.RotaLeaveUpdateRequest;
import com.devops.backend.dto.RotaManualAssignmentRequest;
import com.devops.backend.dto.RotaRotationModeRequest;
import com.devops.backend.dto.RotaScheduleDayResponse;
import com.devops.backend.model.RotaState;

import java.util.List;

public interface RotaService {
    RotaState getRotaState();
    RotaState setLeaveForDate(RotaLeaveUpdateRequest request, String actor);
    RotaState setManualAssignment(RotaManualAssignmentRequest request, String actor);
    RotaState setRotationMode(RotaRotationModeRequest request, String actor);
    List<RotaScheduleDayResponse> getRotaSchedule(int days, String startDate);
}
