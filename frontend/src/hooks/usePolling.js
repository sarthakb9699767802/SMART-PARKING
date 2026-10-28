import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Load data once, then refresh it on an interval while the component is mounted.
 *
 * This is simple polling, not a sensor or websocket feed.
 *
 * @param {Function} fetcher  async function returning the data to store
 * @param {Array} deps        effect dependencies (e.g. [locationId, startTime])
 * @param {number} intervalMs refresh interval, default 5000ms
 */
export function usePolling(fetcher, deps = [], intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;

    async function load(isBackgroundRefresh) {
      try {
        const result = await fetcherRef.current();
        if (!active) return;
        setData(result);
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        if (!active) return;
        setError(err.message || "Could not load data from the server.");
      } finally {
        if (active && !isBackgroundRefresh) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    load(false);
    const timer = setInterval(() => load(true), intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  return { data, error, loading, lastUpdated, refresh };
}
