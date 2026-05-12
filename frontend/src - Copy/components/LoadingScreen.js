import React, { useState, useEffect, useMemo } from "react";
import { firstNameFromDisplay } from "../services/loadingGreetingTts";

const ROLE_LABEL = {
    user: "Request portal",
    devops: "Operations deck",
    admin: "Control room",
};

function shuffleInPlace(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildMessageLines(role, first) {
    const n = first;
    const lines = {
        user: [
            n ? `Hey ${n} — we're negotiating peace between React and the API.` : "Negotiating peace between React and the API…",
            n ? `${n}, your dashboard is doing push-ups. Almost buff.` : "Your dashboard is doing warm-up stretches…",
            "Convincing spinners to spin with enthusiasm…",
            n ? `Routing good vibes to you, ${n}.` : "Routing good vibes your way…",
            "Teaching pixels to stand in a straight line…",
            n ? `${n}, the cloud said “five more minutes.” We're on it.` : "The cloud asked for five more minutes. Classic.",
            "Syncing faster than a meeting could have been an email…",
            n ? `Almost there, ${n} — nobody panic, the logs look fine.` : "Almost there — logs are behaving… today.",
        ],
        devops: [
            n ? `${n}, greasing the queue rails…` : "Greasing the queue rails…",
            "Counting pods so you don't have to…",
            n ? `Stand by ${n} — we're herding cats into Kubernetes.` : "Herding cats into Kubernetes-shaped boxes…",
            "Checking if staging is still pretending to be prod…",
            n ? `${n}, fetching reality from config maps…` : "Fetching reality from config maps…",
            "Turning “it works on my machine” into “it works”…",
            "SRE stands for Seriously Relaxed, Eventually… loading anyway.",
            n ? `Hang tight ${n} — incidents fear you.` : "Incidents fear you. Data incoming.",
        ],
        admin: [
            n ? `${n}, polishing the big red buttons…` : "Polishing the big red buttons…",
            "Counting users who read the banner (estimate: 3)…",
            n ? `Powering up, ${n} — spreadsheets are standing by.` : "Spreadsheets are standing by…",
            "Loading policies. Yes, all of them. Okay, most of them.",
            n ? `${n}, syncing the matrix… the boring, compliant matrix.` : "Syncing the compliant matrix…",
            "Granting permissions like a responsible wizard…",
            "Almost ready — audit trail already writing fan fiction.",
            n ? `Easy, ${n} — we're not deploying on a Friday.` : "Not deploying on a Friday. Probably.",
        ],
    };
    return lines[role] || lines.user;
}

export const LoadingScreen = ({ role = "user", userName }) => {
    const first = useMemo(() => firstNameFromDisplay(userName), [userName]);
    const messages = useMemo(
        () => shuffleInPlace(buildMessageLines(role, first)),
        [role, first]
    );
    const [msgIdx, setMsgIdx] = useState(0);

    useEffect(() => {
        setMsgIdx(0);
    }, [role, first]);

    useEffect(() => {
        const t = setInterval(
            () => setMsgIdx((i) => (i + 1) % Math.max(messages.length, 1)),
            2400
        );
        return () => clearInterval(t);
    }, [messages.length]);

    const roleKey = role in ROLE_LABEL ? role : "user";

    return (
        <div className="sl-screen sl-screen--light">
            <div className="sl-mesh" aria-hidden />
            <div className="sl-orb sl-orb1" aria-hidden />
            <div className="sl-orb sl-orb2" aria-hidden />
            <div className="sl-orb sl-orb3" aria-hidden />

            <div className="sl-card">
                <div className="sl-hero" aria-hidden>
                    <div className="sl-hero-rings">
                        <span className="sl-hero-ring sl-hero-ring--a" />
                        <span className="sl-hero-ring sl-hero-ring--b" />
                        <span className="sl-hero-ring sl-hero-ring--c" />
                        <span className="sl-hero-core" />
                    </div>
                </div>

                <div className="sl-brand sl-brand--wordmark">
                    <span className="sl-brand-text sl-brand-text--shimmer">ShipIt</span>
                    <span className="sl-brand-badge">{ROLE_LABEL[roleKey]}</span>
                </div>

                {first && (
                    <p className="sl-greeting">
                        Nice to see you, <span className="sl-greeting-name">{first}</span>
                    </p>
                )}

                <p className="sl-msg" key={msgIdx}>
                    {messages[msgIdx % messages.length]}
                </p>

                <div className="sl-progress-track" role="progressbar" aria-valuetext="Loading">
                    <div className="sl-progress-fill" />
                </div>

                <div className="sl-dots" aria-hidden>
                    <span className="sl-dot" />
                    <span className="sl-dot" />
                    <span className="sl-dot" />
                </div>
            </div>
        </div>
    );
};
