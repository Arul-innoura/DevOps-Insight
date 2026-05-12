package com.devops.backend.service.impl;

import com.devops.backend.dto.RotaLeaveUpdateRequest;
import com.devops.backend.dto.RotaManualAssignmentRequest;
import com.devops.backend.dto.RotaRotationModeRequest;
import com.devops.backend.dto.RotaScheduleDayResponse;
import com.devops.backend.model.DevOpsMember;
import com.devops.backend.model.RotaState;
import com.devops.backend.repository.DevOpsMemberRepository;
import com.devops.backend.repository.RotaStateRepository;
import com.devops.backend.service.RotaService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RotaServiceImpl implements RotaService {

    private static final String ROTA_STATE_ID = "default";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ISO_LOCAL_DATE;

    private final RotaStateRepository rotaStateRepository;
    private final DevOpsMemberRepository devOpsMemberRepository;

    @Override
    public RotaState getRotaState() {
        return ensureState();
    }

    @Override
    public RotaState setLeaveForDate(RotaLeaveUpdateRequest request, String actor) {
        RotaState state = ensureState();
        String date = normalizeDate(request.getDate());
        String email = normalizeEmail(request.getEmail());

        Map<String, List<String>> leaveByDate = new HashMap<>(safeMap(state.getLeaveByDate()));
        Set<String> set = leaveByDate.getOrDefault(date, new ArrayList<>()).stream()
                .map(this::normalizeEmail)
                .filter(s -> !s.isBlank())
                .collect(Collectors.toSet());

        if (request.isLeave()) {
            set.add(email);
        } else {
            set.remove(email);
        }

        if (set.isEmpty()) {
            leaveByDate.remove(date);
        } else {
            leaveByDate.put(date, new ArrayList<>(set));
        }

        state.setLeaveByDate(leaveByDate);
        state.setUpdatedBy(actor);
        state.setUpdatedAt(Instant.now());
        return rotaStateRepository.save(state);
    }

    @Override
    public RotaState setManualAssignment(RotaManualAssignmentRequest request, String actor) {
        RotaState state = ensureState();
        String date = normalizeDate(request.getDate());

        List<String> normalized = (request.getEmails() == null ? List.<String>of() : request.getEmails())
                .stream()
                .map(this::normalizeEmail)
                .filter(s -> !s.isBlank())
                .distinct()
                .limit(4)
                .toList();

        Map<String, List<String>> manual = new HashMap<>(safeMap(state.getManualAssignments()));
        if (normalized.isEmpty()) {
            manual.remove(date);
        } else {
            manual.put(date, normalized);
        }

        state.setManualAssignments(manual);
        state.setUpdatedBy(actor);
        state.setUpdatedAt(Instant.now());
        return rotaStateRepository.save(state);
    }

    @Override
    public RotaState setRotationMode(RotaRotationModeRequest request, String actor) {
        String raw = request.getRotationMode() == null ? "" : request.getRotationMode().trim().toUpperCase(Locale.ROOT);
        if (!"DAILY".equals(raw) && !"WEEKLY".equals(raw)) {
            throw new IllegalArgumentException("rotationMode must be DAILY or WEEKLY");
        }
        RotaState state = ensureState();
        state.setRotationMode(raw);
        state.setUpdatedBy(actor);
        state.setUpdatedAt(Instant.now());
        return rotaStateRepository.save(state);
    }

    @Override
    public List<RotaScheduleDayResponse> getRotaSchedule(int days, String startDate) {
        int safeDays = days <= 0 ? 14 : Math.min(days, 90);
        LocalDate start = (startDate == null || startDate.isBlank()) ? LocalDate.now() : LocalDate.parse(startDate, DATE_FMT);

        RotaState state = ensureState();
        Map<String, DevOpsMember> membersByEmail = devOpsMemberRepository.findAll().stream()
                .collect(Collectors.toMap(m -> normalizeEmail(m.getEmail()), m -> m, (a, b) -> a, LinkedHashMap::new));

        List<String> workingOrder = new ArrayList<>(state.getOrderEmails() == null ? List.of() : state.getOrderEmails());
        String mode = state.getRotationMode() == null || state.getRotationMode().isBlank()
                ? "DAILY"
                : state.getRotationMode().trim().toUpperCase(Locale.ROOT);

        List<RotaScheduleDayResponse> out = new ArrayList<>();
        LocalDate lastWeekMonday = null;
        String weekPrimaryEmail = null;

        for (int i = 0; i < safeDays; i++) {
            LocalDate day = start.plusDays(i);
            String dateKey = day.format(DATE_FMT);

            Set<String> leaveSet = safeMap(state.getLeaveByDate()).getOrDefault(dateKey, List.of()).stream()
                    .map(this::normalizeEmail)
                    .collect(Collectors.toSet());

            List<String> eligible = eligibleForDate(day, workingOrder, membersByEmail, state.getLeaveByDate());

            List<String> manualRaw = safeMap(state.getManualAssignments()).getOrDefault(dateKey, List.of()).stream()
                    .map(this::normalizeEmail)
                    .filter(eligible::contains)
                    .limit(4)
                    .toList();

            List<String> assigned;
            if ("WEEKLY".equals(mode)) {
                LocalDate monday = day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                if (lastWeekMonday == null || !monday.equals(lastWeekMonday)) {
                    if (lastWeekMonday != null && weekPrimaryEmail != null && !weekPrimaryEmail.isBlank()) {
                        rotateEmailToEnd(workingOrder, weekPrimaryEmail);
                    }
                    lastWeekMonday = monday;
                    List<String> eligibleMon = eligibleForDate(monday, workingOrder, membersByEmail, state.getLeaveByDate());
                    weekPrimaryEmail = eligibleMon.isEmpty() ? null : eligibleMon.get(0);
                }
                if (!manualRaw.isEmpty()) {
                    assigned = manualRaw;
                } else {
                    List<String> eligibleToday = eligibleForDate(day, workingOrder, membersByEmail, state.getLeaveByDate());
                    if (weekPrimaryEmail != null && eligibleToday.contains(weekPrimaryEmail)) {
                        assigned = List.of(weekPrimaryEmail);
                    } else if (!eligibleToday.isEmpty()) {
                        assigned = List.of(eligibleToday.get(0));
                    } else {
                        assigned = List.of();
                    }
                }
            } else {
                assigned = manualRaw.isEmpty()
                        ? (eligible.isEmpty() ? List.of() : List.of(eligible.get(0)))
                        : manualRaw;
            }

            if ("DAILY".equals(mode) || !manualRaw.isEmpty()) {
                for (String email : assigned) {
                    rotateEmailToEnd(workingOrder, email);
                }
            }

            List<DevOpsMember> assignedMembers = assigned.stream()
                    .map(membersByEmail::get)
                    .filter(java.util.Objects::nonNull)
                    .toList();

            out.add(RotaScheduleDayResponse.builder()
                    .date(dateKey)
                    .dayName(day.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.US))
                    .members(assignedMembers)
                    .manual(!manualRaw.isEmpty())
                    .build());
        }

        return out;
    }

    private List<String> eligibleForDate(LocalDate day, List<String> workingOrder,
                                         Map<String, DevOpsMember> membersByEmail,
                                         Map<String, List<String>> leaveByDate) {
        String dateKey = day.format(DATE_FMT);
        Set<String> leaveSet = safeMap(leaveByDate).getOrDefault(dateKey, List.of()).stream()
                .map(this::normalizeEmail)
                .collect(Collectors.toSet());
        return workingOrder.stream()
                .map(this::normalizeEmail)
                .filter(membersByEmail::containsKey)
                .filter(email -> !leaveSet.contains(email))
                .toList();
    }

    private void rotateEmailToEnd(List<String> workingOrder, String email) {
        String norm = normalizeEmail(email);
        int idx = workingOrder.indexOf(norm);
        if (idx >= 0) {
            workingOrder.remove(idx);
            workingOrder.add(norm);
        }
    }

    private RotaState ensureState() {
        List<DevOpsMember> members = devOpsMemberRepository.findAll().stream()
                .sorted(Comparator.comparing(DevOpsMember::getEmail, String.CASE_INSENSITIVE_ORDER))
                .toList();

        List<String> alphabetical = members.stream()
                .map(m -> normalizeEmail(m.getEmail()))
                .filter(s -> !s.isBlank())
                .toList();

        RotaState state = rotaStateRepository.findById(ROTA_STATE_ID).orElse(
                RotaState.builder()
                        .id(ROTA_STATE_ID)
                        .orderEmails(new ArrayList<>(alphabetical))
                        .leaveByDate(new HashMap<>())
                        .manualAssignments(new HashMap<>())
                        .startDate(LocalDate.now().format(DATE_FMT))
                        .updatedAt(Instant.now())
                        .updatedBy("System")
                        .build()
        );

        List<String> kept = (state.getOrderEmails() == null ? List.<String>of() : state.getOrderEmails())
                .stream()
                .map(this::normalizeEmail)
                .filter(alphabetical::contains)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));

        for (String email : alphabetical) {
            if (!kept.contains(email)) {
                kept.add(email);
            }
        }

        state.setId(ROTA_STATE_ID);
        state.setOrderEmails(kept);
        if (state.getLeaveByDate() == null) state.setLeaveByDate(new HashMap<>());
        if (state.getManualAssignments() == null) state.setManualAssignments(new HashMap<>());
        if (state.getRotationMode() == null || state.getRotationMode().isBlank()) {
            state.setRotationMode("DAILY");
        }
        if (state.getStartDate() == null || state.getStartDate().isBlank()) {
            state.setStartDate(LocalDate.now().format(DATE_FMT));
        }

        return rotaStateRepository.save(state);
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private String normalizeDate(String date) {
        return LocalDate.parse(date, DATE_FMT).format(DATE_FMT);
    }

    private Map<String, List<String>> safeMap(Map<String, List<String>> map) {
        return map == null ? Map.of() : map;
    }
}
