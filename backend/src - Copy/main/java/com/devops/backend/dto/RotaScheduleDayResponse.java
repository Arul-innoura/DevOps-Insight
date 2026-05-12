package com.devops.backend.dto;

import com.devops.backend.model.DevOpsMember;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RotaScheduleDayResponse {
    private String date;
    private String dayName;

    @Builder.Default
    private List<DevOpsMember> members = new ArrayList<>();

    private boolean manual;
}
