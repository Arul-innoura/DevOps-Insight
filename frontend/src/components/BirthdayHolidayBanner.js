import React, { useEffect, useState } from "react";
import { X, Cake, Sparkles } from "lucide-react";
import { getMyProfile } from "../services/profileService";

/**
 * Holiday calendar — keep aligned with backend BirthdayHolidayScheduler.HOLIDAYS.
 * Key format: "MM-DD".
 */
const HOLIDAYS = {
    "01-01": "New Year's Day",
    "01-26": "Republic Day",
    "05-01": "Labour Day",
    "08-15": "Independence Day",
    "10-02": "Gandhi Jayanti",
    "10-31": "Halloween",
    "11-01": "All Saints' Day",
    "12-24": "Christmas Eve",
    "12-25": "Christmas Day",
    "12-31": "New Year's Eve"
};

function todayMmDd() {
    const d = new Date();
    return (
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
    );
}

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Small banner shown once per day per category (per browser session).
 * Renders nothing on non-celebration days, and nothing if the user has
 * already dismissed today's banner.
 */
export default function BirthdayHolidayBanner({ userName }) {
    const [banner, setBanner] = useState(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const mmdd = todayMmDd();

        // Holiday wins over birthday only because it applies to everyone.
        // If both happen on the same day, we still show the holiday first;
        // a user can dismiss it to see the next day's birthday banner.
        const holidayName = HOLIDAYS[mmdd];

        (async () => {
            // Birthday detection requires the user's stored DOB
            let isBirthday = false;
            try {
                const profile = await getMyProfile();
                const dob = profile && profile.dateOfBirth;
                if (dob && typeof dob === "string" && dob.length >= 7) {
                    isBirthday = dob.substring(5, 10) === mmdd;
                }
            } catch {
                // Silent — banner is non-critical UX
            }
            if (cancelled) return;

            const dismissKey = (type) => `shipit-greet-${type}-${todayKey()}`;

            if (isBirthday && !sessionStorage.getItem(dismissKey("birthday"))) {
                setBanner({ type: "birthday" });
                return;
            }
            if (holidayName && !sessionStorage.getItem(dismissKey("holiday"))) {
                setBanner({ type: "holiday", name: holidayName });
                return;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    if (!banner || hidden) return null;

    const dismiss = () => {
        sessionStorage.setItem(
            `shipit-greet-${banner.type}-${todayKey()}`,
            "1"
        );
        setHidden(true);
    };

    if (banner.type === "birthday") {
        return (
            <div
                className="wishes-banner wishes-banner--birthday"
                role="status"
                aria-live="polite"
            >
                <div className="wishes-banner__icon" aria-hidden>
                    <Cake size={26} />
                </div>
                <div className="wishes-banner__content">
                    <div className="wishes-banner__title">
                        Happy Birthday{userName ? `, ${userName.split(" ")[0]}` : ""}!
                    </div>
                    <div className="wishes-banner__subtitle">
                        Wishing you a wonderful day from the entire ShipIt team.
                    </div>
                </div>
                <button
                    className="wishes-banner__close"
                    onClick={dismiss}
                    aria-label="Dismiss birthday wishes"
                    type="button"
                >
                    <X size={16} />
                </button>
            </div>
        );
    }

    return (
        <div
            className="wishes-banner wishes-banner--holiday"
            role="status"
            aria-live="polite"
        >
            <div className="wishes-banner__icon" aria-hidden>
                <Sparkles size={24} />
            </div>
            <div className="wishes-banner__content">
                <div className="wishes-banner__title">Happy {banner.name}!</div>
                <div className="wishes-banner__subtitle">
                    Warm wishes from the ShipIt team — enjoy your day.
                </div>
            </div>
            <button
                className="wishes-banner__close"
                onClick={dismiss}
                aria-label={`Dismiss ${banner.name} wishes`}
                type="button"
            >
                <X size={16} />
            </button>
        </div>
    );
}
