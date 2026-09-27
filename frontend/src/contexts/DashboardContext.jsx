import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const DashboardContext = createContext(null);

/**
 * Global context for dashboard data (summary stats and top performers).
 * Uses lazy loading - fetches only when dashboard is visited.
 * Caches for 5 minutes to avoid redundant queries.
 */
export function DashboardProvider({ children }) {
  const { token } = useAuth();
  
  // Summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [lastSummaryFetch, setLastSummaryFetch] = useState(null);
  
  // Top performers state (cached per dimension)
  const [topPerformersCache, setTopPerformersCache] = useState({});
  const [topPerformersLoading, setTopPerformersLoading] = useState({});
  const [lastPerformersFetch, setLastPerformersFetch] = useState({});
  
  // Refs to prevent duplicate fetches
  const summaryFetchingRef = useRef(false);
  const performersFetchingRef = useRef({});
  
  // Cache duration: 6 hours
  const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

  const fetchSummary = useCallback(async (force = false) => {
    // Skip if already fetching
    if (summaryFetchingRef.current) return summary;
    
    // Use cache if available and not expired
    const now = Date.now();
    if (!force && summary && lastSummaryFetch && (now - lastSummaryFetch) < CACHE_DURATION_MS) {
      return summary;
    }
    
    summaryFetchingRef.current = true;
    setSummaryLoading(true);
    
    try {
      const response = await api.get('/analytics/dashboard-summary');
      setSummary(response.data);
      setLastSummaryFetch(now);
      return response.data;
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
      return null;
    } finally {
      setSummaryLoading(false);
      summaryFetchingRef.current = false;
    }
  }, [summary, lastSummaryFetch]);

  const fetchTopPerformers = useCallback(async (dimension = 'category', force = false) => {
    // Skip if already fetching this dimension
    if (performersFetchingRef.current[dimension]) {
      return topPerformersCache[dimension] || [];
    }
    
    // Use cache if available and not expired
    const now = Date.now();
    const cachedData = topPerformersCache[dimension];
    const lastFetch = lastPerformersFetch[dimension];
    
    if (!force && cachedData && lastFetch && (now - lastFetch) < CACHE_DURATION_MS) {
      return cachedData;
    }
    
    performersFetchingRef.current[dimension] = true;
    setTopPerformersLoading(prev => ({ ...prev, [dimension]: true }));
    
    try {
      const response = await api.get(`/analytics/top-performers?dimension=${dimension}&limit=5`);
      const data = response.data.data || [];
      
      setTopPerformersCache(prev => ({ ...prev, [dimension]: data }));
      setLastPerformersFetch(prev => ({ ...prev, [dimension]: now }));
      
      return data;
    } catch (err) {
      console.error(`Failed to fetch top performers (${dimension}):`, err);
      return [];
    } finally {
      setTopPerformersLoading(prev => ({ ...prev, [dimension]: false }));
      performersFetchingRef.current[dimension] = false;
    }
  }, [topPerformersCache, lastPerformersFetch]);

  // Clear cache on logout
  useEffect(() => {
    if (!token) {
      setSummary(null);
      setTopPerformersCache({});
      setLastSummaryFetch(null);
      setLastPerformersFetch({});
      summaryFetchingRef.current = false;
      performersFetchingRef.current = {};
    }
  }, [token]);

  // Force refresh all dashboard data
  const refreshDashboard = useCallback(async () => {
    summaryFetchingRef.current = false;
    performersFetchingRef.current = {};
    await fetchSummary(true);
  }, [fetchSummary]);

  const value = {
    // Summary
    summary,
    summaryLoading,
    fetchSummary,
    
    // Top performers
    topPerformersCache,
    topPerformersLoading,
    fetchTopPerformers,
    getTopPerformers: (dimension) => topPerformersCache[dimension] || [],
    isTopPerformersLoading: (dimension) => topPerformersLoading[dimension] || false,
    
    // Refresh
    refreshDashboard,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

export default DashboardContext;

