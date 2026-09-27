import { useState, useEffect, useCallback } from 'react';
import api, { extractErrorMessage } from '../services/api';
import { getDefaultStartDate, getToday } from '../utils/formatters';
import { useFilters } from '../contexts/FiltersContext';
import { useDateAnchor } from '../contexts/DateAnchorContext';

/**
 * Custom hook for analytics pages that consolidates common state and logic.
 * Uses shared FiltersContext for cached filter data (categories, brands, regions).
 * Handles date range state, loading states, and results management.
 * 
 * @param {Object} options - Hook options
 * @param {number} options.defaultDaysBack - Default number of days back for start date (default: 30)
 * @param {boolean} options.fetchFiltersOnMount - Whether to ensure filters are loaded on mount (default: true)
 * @returns {Object} Analytics page state and handlers
 */
export function useAnalyticsPage({ 
  defaultDaysBack = 30,
  fetchFiltersOnMount = true 
} = {}) {
  // Use shared filters context (cached globally)
  const { 
    filters, 
    filtersLoading, 
    fetchFilters: refreshFilters,
    fetchCohorts
  } = useFilters();

  // The app's reference date comes from the data (MAX(transaction_date)), not the
  // browser clock - see DateAnchorContext.
  const { anchor, loaded: anchorLoaded } = useDateAnchor();

  // Report execution state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Date range state, seeded from the anchor when available.
  const [startDate, setStartDate] = useState(() => getDefaultStartDate(defaultDaysBack, anchor));
  const [endDate, setEndDate] = useState(() => getToday(anchor));

  // The anchor arrives asynchronously, so the first render may have seeded from
  // the browser clock. Re-seed once it lands, but only if the user has not
  // already changed the dates themselves.
  const [datesTouched, setDatesTouched] = useState(false);
  useEffect(() => {
    if (anchorLoaded && anchor && !datesTouched) {
      setStartDate(getDefaultStartDate(defaultDaysBack, anchor));
      setEndDate(getToday(anchor));
    }
  }, [anchorLoaded, anchor, defaultDaysBack, datesTouched]);

  const setStartDateTracked = useCallback((v) => {
    setDatesTouched(true);
    setStartDate(v);
  }, []);
  const setEndDateTracked = useCallback((v) => {
    setDatesTouched(true);
    setEndDate(v);
  }, []);

  // Ensure filters and cohorts are loaded on mount if needed
  useEffect(() => {
    if (fetchFiltersOnMount) {
      refreshFilters();
      fetchCohorts();
    }
  }, []); // Empty deps - only run once on mount

  // Reset error when results change
  useEffect(() => {
    if (results) {
      setError(null);
    }
  }, [results]);

  // Generic execute function that can be used by any report
  const executeReport = useCallback(async (apiCall) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiCall();
      setResults(response.data);
      return response.data;
    } catch (error) {
      console.error('Report execution failed:', error);
      setError(extractErrorMessage(error, 'Report execution failed'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear results
  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
    // Filter state (from shared context - cached globally)
    filters,
    filtersLoading,
    fetchFilters: refreshFilters,
    
    // Date range state. The setters are wrapped so that a user-chosen date is
    // never overwritten when the async date anchor resolves.
    startDate,
    setStartDate: setStartDateTracked,
    endDate,
    setEndDate: setEndDateTracked,

    // Reference date the defaults were derived from (null => browser clock)
    dateAnchor: anchor,
    dateAnchorLoaded: anchorLoaded,
    
    // Report execution state
    loading,
    setLoading,
    results,
    setResults,
    error,
    setError,
    
    // Helpers
    executeReport,
    clearResults,
  };
}

/**
 * Helper to create getCurrentParams and loadPreset functions for a report.
 * 
 * @param {Object} stateGetters - Object mapping param names to their getter functions
 * @param {Object} stateSetters - Object mapping param names to their setter functions
 * @returns {{ getCurrentParams: Function, loadPreset: Function }}
 * 
 * @example
 * const { getCurrentParams, loadPreset } = usePresetHandlers(
 *   { analysisType, startDate, endDate },
 *   { setAnalysisType, setStartDate, setEndDate }
 * );
 */
export function usePresetHandlers(stateValues, stateSetters) {
  const getCurrentParams = useCallback(() => {
    return { ...stateValues };
  }, [stateValues]);

  const loadPreset = useCallback((params) => {
    Object.entries(params).forEach(([key, value]) => {
      const setter = stateSetters[key];
      if (setter && value !== undefined) {
        setter(value);
      }
    });
  }, [stateSetters]);

  return { getCurrentParams, loadPreset };
}

export default useAnalyticsPage;

