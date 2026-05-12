package com.devops.backend.scheduler;

import com.devops.backend.model.UserProfile;
import com.devops.backend.repository.UserProfileRepository;
import com.devops.backend.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * Daily greeting job:
 *   • Birthday wishes — sent to every user_profile whose stored birth month-day matches today.
 *   • Holiday wishes — sent to every user_profile when today is a configured holiday.
 *
 * Runs once a day at 08:00 in {@code app.greetings.timezone} (default Asia/Kolkata).
 * Failure of one recipient does NOT abort the rest of the batch — each send is wrapped.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BirthdayHolidayScheduler {

    private static final DateTimeFormatter MM_DD = DateTimeFormatter.ofPattern("MM-dd");

    /** Hardcoded calendar — extend as needed. Keys are "MM-dd". */
    private static final Map<String, String> HOLIDAYS = Map.ofEntries(
            Map.entry("01-01", "New Year's Day"),
            Map.entry("01-26", "Republic Day"),
            Map.entry("05-01", "Labour Day"),
            Map.entry("08-15", "Independence Day"),
            Map.entry("10-02", "Gandhi Jayanti"),
            Map.entry("10-31", "Halloween"),
            Map.entry("11-01", "All Saints' Day"),
            Map.entry("12-24", "Christmas Eve"),
            Map.entry("12-25", "Christmas Day"),
            Map.entry("12-31", "New Year's Eve")
    );

    private final UserProfileRepository profileRepository;
    private final EmailService emailService;

    @Value("${app.greetings.timezone:Asia/Kolkata}")
    private String timezone;

    @Value("${app.greetings.enabled:true}")
    private boolean enabled;

    /** Daily at 08:00 in the configured timezone. */
    @Scheduled(cron = "0 0 8 * * *", zone = "${app.greetings.timezone:Asia/Kolkata}")
    public void runDailyGreetings() {
        if (!enabled) {
            log.info("[Greetings] disabled via config — skipping run");
            return;
        }
        LocalDate today = LocalDate.now(ZoneId.of(timezone));
        String mmdd = MM_DD.format(today);
        log.info("[Greetings] Daily run for {} ({})", today, mmdd);

        runBirthdays(mmdd);
        runHolidays(mmdd);
    }

    private void runBirthdays(String mmdd) {
        List<UserProfile> matches = profileRepository.findByBirthMonthDay(mmdd);
        if (matches.isEmpty()) {
            log.info("[Greetings] no birthdays today");
            return;
        }
        log.info("[Greetings] sending birthday emails to {} user(s)", matches.size());
        for (UserProfile p : matches) {
            try {
                String name = nameFromEmail(p.getEmail());
                emailService.sendBirthdayWishes(p.getEmail(), name);
            } catch (Exception e) {
                log.warn("[Greetings] birthday send failed for {}: {}", p.getEmail(), e.getMessage());
            }
        }
    }

    private void runHolidays(String mmdd) {
        String holidayName = HOLIDAYS.get(mmdd);
        if (holidayName == null) {
            log.info("[Greetings] no holiday today");
            return;
        }
        List<UserProfile> all = profileRepository.findAll();
        log.info("[Greetings] {} — sending holiday emails to {} user(s)", holidayName, all.size());
        for (UserProfile p : all) {
            try {
                String name = nameFromEmail(p.getEmail());
                emailService.sendHolidayWishes(p.getEmail(), name, holidayName);
            } catch (Exception e) {
                log.warn("[Greetings] holiday send failed for {}: {}", p.getEmail(), e.getMessage());
            }
        }
    }

    /** Take the part before '@' and title-case it as a reasonable fallback name. */
    private String nameFromEmail(String email) {
        if (email == null || !email.contains("@")) return "there";
        String local = email.substring(0, email.indexOf('@'));
        if (local.isEmpty()) return "there";
        String[] parts = local.split("[._-]");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) sb.append(part.substring(1).toLowerCase());
        }
        return sb.length() > 0 ? sb.toString() : "there";
    }
}
