import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const FiltersContext = createContext(null);

/**
 * Global context for analytics filters (categories, brands, regions) and cohorts.
 * Uses lazy loading - fetches only when a page actually needs the data.
 * Caches for 5 minutes to avoid redundant queries.
 */
export function FiltersProvider({ children }) {
  const { token } = useAuth();
  
  // Filters state
  const [filters, setFilters] = useState(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  
  // Cohorts state (separate cache)
  const [cohorts, setCohorts] = useState(null);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  
  // Stores state (separate cache for Store Assortment)
  const [stores, setStores] = useState(null);
  const [storesLoading, setStoresLoading] = useState(false);
  
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [lastCohortsFetchTime, setLastCohortsFetchTime] = useState(null);
  const [lastStoresFetchTime, setLastStoresFetchTime] = useState(null);
  
  // Refs to prevent duplicate fetches (especially in React StrictMode)
  const filtersFetchingRef = useRef(false);
  const cohortsFetchingRef = useRef(false);
  const storesFetchingRef = useRef(false);
  
  // Cache duration: 6 hours (filters rarely change)
  const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

  const fetchFilters = useCallback(async (force = false) => {
    // Skip if already fetching (using ref to handle StrictMode double-invoke)
    if (filtersFetchingRef.current) return filters;
    
    // Use cached data if available and not expired (unless forced)
    const now = Date.now();
    if (!force && filters && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION_MS) {
      return filters;
    }
    
    filtersFetchingRef.current = true;
    setFiltersLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/analytics/filters');
      setFilters(response.data);
      setLastFetchTime(now);
      return response.data;
    } catch (err) {
      console.error('Failed to fetch filters:', err);
      setError('Failed to load filters');
      return null;
    } finally {
      setFiltersLoading(false);
      filtersFetchingRef.current = false;
    }
  }, [filters, lastFetchTime]);

  const fetchCohorts = useCallback(async (force = false) => {
    // Skip if already fetching (using ref to handle StrictMode double-invoke)
    if (cohortsFetchingRef.current) return cohorts;
    
    // Use cached data if available and not expired (unless forced)
    const now = Date.now();
    if (!force && cohorts && lastCohortsFetchTime && (now - lastCohortsFetchTime) < CACHE_DURATION_MS) {
      return cohorts;
    }
    
    cohortsFetchingRef.current = true;
    setCohortsLoading(true);
    
    try {
      const response = await api.get('/cohorts');
      const cohortsList = response.data.cohorts || [];
      setCohorts(cohortsList);
      setLastCohortsFetchTime(now);
      return cohortsList;
    } catch (err) {
      console.error('Failed to fetch cohorts:', err);
      // Don't set error - cohorts are optional
      return [];
    } finally {
      setCohortsLoading(false);
      cohortsFetchingRef.current = false;
    }
  }, [cohorts, lastCohortsFetchTime]);

  const fetchStores = useCallback(async (force = false) => {
    // Skip if already fetching (using ref to handle StrictMode double-invoke)
    if (storesFetchingRef.current) return stores;
    
    // Use cached data if available and not expired (unless forced)
    const now = Date.now();
    if (!force && stores && lastStoresFetchTime && (now - lastStoresFetchTime) < CACHE_DURATION_MS) {
      return stores;
    }
    
    storesFetchingRef.current = true;
    setStoresLoading(true);
    
    try {
      const response = await api.get('/operations/store-assortment/stores');
      const storesList = response.data.stores || [];
      setStores(storesList);
      setLastStoresFetchTime(now);
      return storesList;
    } catch (err) {
      console.error('Failed to fetch stores:', err);
      return [];
    } finally {
      setStoresLoading(false);
      storesFetchingRef.current = false;
    }
  }, [stores, lastStoresFetchTime]);

  // Clear cache on logout (don't auto-fetch on login - let pages request what they need)
  useEffect(() => {
    if (!token) {
      setFilters(null);
      setCohorts(null);
      setStores(null);
      setLastFetchTime(null);
      setLastCohortsFetchTime(null);
      setLastStoresFetchTime(null);
      filtersFetchingRef.current = false;
      cohortsFetchingRef.current = false;
      storesFetchingRef.current = false;
    }
  }, [token]);

  // Refresh cohorts (useful after creating a new cohort)
  const refreshCohorts = useCallback(() => {
    cohortsFetchingRef.current = false; // Allow refresh even if currently fetching
    return fetchCohorts(true);
  }, [fetchCohorts]);

  const value = {
    // Filter state
    filters,
    filtersLoading,
    filtersError: error,
    fetchFilters,
    // Convenience getters for filters
    categories: filters?.categories || [],
    brands: filters?.brands || [],
    subcategories: filters?.subcategories || [],
    regions: filters?.regions || [],
    
    // Cohort state
    cohorts: cohorts || [],
    cohortsLoading,
    fetchCohorts,
    refreshCohorts,
    
    // Stores state (for Store Assortment)
    stores: stores || [],
    storesLoading,
    fetchStores,
  };

  return (
    <FiltersContext.Provider value={value}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return context;
}

export default FiltersContext;

