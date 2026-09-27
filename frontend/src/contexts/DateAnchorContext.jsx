import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

/**
 * DateAnchorContext
 *
 * Supplies the application's reference date - MAX(transaction_date) in the
 * warehouse - so date pickers and default ranges land inside the data rather
 * than on the browser's "today".
 *
 * Why this matters: the synthetic dataset is generated relative to whenever it
 * was loaded. As days pass, wall-clock today drifts past the end of the data,
 * and any default "last 30 days" range silently returns nothing. Anchoring to
 * the data removes that failure mode. When the data is fresh the anchor equals
 * today, so this is a no-op.
 *
 * Consumers should wait for `loaded` before seeding date state, otherwise the
 * first paint uses the browser date and then visibly jumps.
 */

const DateAnchorContext = createContext(null);

export function DateAnchorProvider({ children }) {
  const [anchor, setAnchor] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const fetchAnchor = async () => {
    try {
      const res = await api.get('/config/date-anchor');
      setAnchor(res.data.anchor_date || null);
      setMeta(res.data);
    } catch (err) {
      // Fail soft: fall back to the browser clock rather than blocking the UI.
      // This mirrors the backend, which falls back to CURRENT_DATE.
      console.warn('Date anchor unavailable, using browser date', err);
      setAnchor(null);
      setMeta(null);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    fetchAnchor();
  }, []);

  const value = {
    // ISO date string, or null when unavailable (callers then use browser date)
    anchor,
    // Full payload: data_min_date, data_max_date, gap_days, using_data_date, ...
    meta,
    loaded,
    refresh: fetchAnchor,
    // True when the app is deliberately reporting as-of a past data date.
    isStale: Boolean(meta?.using_data_date),
    gapDays: meta?.gap_days ?? null,
  };

  return (
    <DateAnchorContext.Provider value={value}>
      {children}
    </DateAnchorContext.Provider>
  );
}

export function useDateAnchor() {
  const ctx = useContext(DateAnchorContext);
  if (!ctx) {
    throw new Error('useDateAnchor must be used within a DateAnchorProvider');
  }
  return ctx;
}
