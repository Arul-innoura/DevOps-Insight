import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Layers } from 'lucide-react';
import { getAnalyticsSettings } from '../services/analyticsSettingsService';

const ROADMAP_PALETTE = [
    '#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626',
    '#0891b2', '#4f46e5', '#db2777', '#0d9488', '#ea580c',
];

function parseDay(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const d = new Date(`${iso.trim()}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function normalizeSegment(raw, idx) {
    const id = raw?.id || `seg-${idx}`;
    const projectName = String(raw?.projectName || '').trim() || 'Project';
    const environment = String(raw?.environment || '').trim();
    const startDate = String(raw?.startDate || '').trim();
    const endDate = String(raw?.endDate || '').trim();
    const label = String(raw?.label || '').trim();
    const color = String(raw?.color || '').trim();
    const sortOrder = Number.isFinite(Number(raw?.sortOrder)) ? Number(raw.sortOrder) : idx;
    return { id, projectName, environment, startDate, endDate, label, color, sortOrder };
}

export function normalizeProjectTimelineSegments(rawList) {
    if (!Array.isArray(rawList)) return [];
    return rawList.map(normalizeSegment).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function pickColor(seg, idx, projectNames) {
    if (seg.color && /^#[0-9a-fA-F]{6}$/.test(seg.color)) return seg.color;
    const p = seg.projectName || '';
    const pi = Math.max(0, projectNames.indexOf(p));
    return ROADMAP_PALETTE[(pi >= 0 ? pi : idx) % ROADMAP_PALETTE.length];
}

/**
 * Horizontal timeline of project/environment segments (read-only).
 */
export function ProjectRoadmapChart({ segments = [], title = 'Project activity timeline' }) {
    const list = useMemo(() => normalizeProjectTimelineSegments(segments), [segments]);
    const projectNames = useMemo(
        () => [...new Set(list.map((s) => s.projectName).filter(Boolean))].sort(),
        [list]
    );

    const { minT, maxT, rows } = useMemo(() => {
        if (!list.length) return { minT: null, maxT: null, rows: [] };
        const now = Date.now();
        let min = null;
        let max = null;
        list.forEach((s) => {
            const st = parseDay(s.startDate);
            if (st == null) return;
            min = min == null ? st : Math.min(min, st);
            const en = parseDay(s.endDate) || now;
            max = max == null ? en : Math.max(max, en);
        });
        if (min == null || max == null) return { minT: null, maxT: null, rows: [] };
        if (max <= min) max = min + 86400000;
        const pad = (max - min) * 0.02;
        const minT = min - pad;
        const maxT = max + pad;
        const range = maxT - minT || 1;
        const fmt = (t) =>
            new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const rows = list
            .map((s, idx) => {
                const st = parseDay(s.startDate);
                if (st == null) return null;
                const en = parseDay(s.endDate) || now;
                const left = ((st - minT) / range) * 100;
                const width = Math.max(0.8, ((en - st) / range) * 100);
                const color = pickColor(s, idx, projectNames);
                const subtitle = [s.environment, s.label].filter(Boolean).join(' · ');
                return {
                    key: s.id,
                    left,
                    width,
                    color,
                    title: `${s.projectName}${subtitle ? ` — ${subtitle}` : ''}`,
                    rangeLabel: `${fmt(st)} → ${s.endDate ? fmt(en) : 'Open'}`,
                };
            })
            .filter(Boolean);
        return { minT, maxT, rows };
    }, [list, projectNames]);

    if (!list.length) {
        return (
            <div className="pr-roadmap pr-roadmap--empty">
                <Layers size={20} aria-hidden />
                <p>No project timeline published yet. Admins can configure this under Analytics → Project roadmap.</p>
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div className="pr-roadmap pr-roadmap--empty">
                <Calendar size={20} aria-hidden />
                <p>Add valid start dates for each segment to see the chart.</p>
            </div>
        );
    }

    const fmtAxis = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
        <div className="pr-roadmap">
            <div className="pr-roadmap-header">
                <Calendar size={18} aria-hidden />
                <h3 className="pr-roadmap-title">{title}</h3>
                <span className="pr-roadmap-axis">
                    {fmtAxis(minT)} — {fmtAxis(maxT)}
                </span>
            </div>
            <div className="pr-roadmap-track-wrap">
                <div className="pr-roadmap-axis-bar" />
                {rows.map((r) => (
                    <div key={r.key} className="pr-roadmap-row" title={`${r.title}\n${r.rangeLabel}`}>
                        <div className="pr-roadmap-bar-slot">
                            <div
                                className="pr-roadmap-bar"
                                style={{ left: `${r.left}%`, width: `${r.width}%`, background: r.color }}
                            />
                        </div>
                        <div className="pr-roadmap-legend">
                            <span className="pr-dot" style={{ background: r.color }} />
                            <span className="pr-roadmap-legend-text">{r.title}</span>
                            <span className="pr-roadmap-dates">{r.rangeLabel}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Loads global analytics settings and shows the published roadmap (monitoring / shared views). */
export function ProjectRoadmapMonitoringCard() {
    const [segments, setSegments] = useState([]);

    useEffect(() => {
        let cancelled = false;
        getAnalyticsSettings()
            .then((raw) => {
                if (cancelled) return;
                const list = raw?.projectTimelineSegments;
                setSegments(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setSegments([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!segments.length) return null;

    return (
        <div className="pr-monitoring-card sa-card sa-card-full">
            <ProjectRoadmapChart segments={segments} title="Live projects by environment" />
        </div>
    );
}
