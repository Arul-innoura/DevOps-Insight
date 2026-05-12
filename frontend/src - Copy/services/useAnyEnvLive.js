import { useState, useEffect, useCallback } from 'react';
import { getMonitoringProducts, getUptimeSessions } from './monitoringService';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);

async function fetchLiveItems() {
    const products = await getMonitoringProducts();
    if (!Array.isArray(products) || products.length === 0) return [];
    const toDate = today();
    // Look back 7 days to catch sessions that started days ago and are still live
    const fromDate = daysAgo(7);
    const results = await Promise.all(
        products.map(p =>
            getUptimeSessions({ productName: p, from: fromDate, to: toDate }).catch(() => [])
        )
    );
    const items = [];
    for (let i = 0; i < products.length; i++) {
        const live = (results[i] || []).filter(s => s.endTime === null);
        if (live.length > 0) {
            items.push({
                product: products[i],
                envs: [...new Set(live.map(s => s.environment))],
                liveSessions: live, // full session objects for duration display
            });
        }
    }
    return items;
}

/**
 * Returns true if ANY environment across ALL products is currently running.
 * Polls every 2 minutes in the background.
 */
export function useAnyEnvLive() {
    const [hasLive, setHasLive] = useState(false);

    const check = useCallback(async () => {
        try {
            const items = await fetchLiveItems();
            setHasLive(items.length > 0);
        } catch {
            // silently ignore
        }
    }, []);

    useEffect(() => {
        check();
        const id = setInterval(check, 120_000);
        return () => clearInterval(id);
    }, [check]);

    return hasLive;
}

/**
 * Returns detailed live-environment summary: { hasLive, items, refresh }
 * items = [{ product, envs: string[], liveSessions: Session[] }]
 */
export function useLiveEnvSummary() {
    const [state, setState] = useState({ hasLive: false, items: [] });

    const check = useCallback(async () => {
        try {
            const items = await fetchLiveItems();
            setState({ hasLive: items.length > 0, items });
        } catch {
            // silently ignore
        }
    }, []);

    useEffect(() => {
        check();
        const id = setInterval(check, 60_000);
        return () => clearInterval(id);
    }, [check]);

    return { ...state, refresh: check };
}
