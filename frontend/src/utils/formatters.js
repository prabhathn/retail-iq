/**
 * Shared formatting utilities for the RetailIQ application.
 * Consolidates common formatting functions used across analytics pages.
 */

/**
 * Format a number as currency with automatic K/M suffixes for large values.
 * @param {number} value - The value to format
 * @param {Object} options - Formatting options
 * @param {boolean} options.compact - Use compact notation (K/M) for large values (default: true)
 * @param {number} options.decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, { compact = true, decimals = 2 } = {}) {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  }
  
  return `$${value.toFixed(decimals)}`;
}

/**
 * Format a date string for display.
 * @param {string} dateStr - ISO date string or date object
 * @param {Object} options - Date formatting options
 * @param {boolean} options.includeTime - Include time in output (default: false)
 * @param {boolean} options.includeYear - Include year in output (default: false for short dates)
 * @returns {string} Formatted date string
 */
export function formatDate(dateStr, { includeTime = false, includeYear = true } = {}) {
  if (!dateStr) return 'Never';
  
  const d = new Date(dateStr);
  
  const options = {
    month: 'short',
    day: 'numeric',
  };
  
  if (includeYear) {
    options.year = 'numeric';
  }
  
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return d.toLocaleDateString('en-US', options);
}

/**
 * Format a number with thousand separators.
 * @param {number} value - The value to format
 * @returns {string} Formatted number string
 */
export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return value.toLocaleString();
}

/**
 * Format a percentage value.
 * @param {number|string} value - The value to format (0-100), can be string or number
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string
 */
export function formatPercent(value, decimals = 1) {
  // Handle null, undefined, or empty values
  if (value === null || value === undefined || value === '') return '0%';
  
  // Convert to number - handles strings, Decimal objects, etc.
  let num;
  try {
    num = typeof value === 'number' ? value : parseFloat(String(value));
  } catch (e) {
    return '0%';
  }
  
  // Check if conversion resulted in a valid number
  if (isNaN(num) || !isFinite(num)) return '0%';
  
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format a metric value based on metric type (sales, transactions, basket_size).
 * @param {number} value - The value to format
 * @param {string} metric - The metric type
 * @returns {string} Formatted value string
 */
export function formatMetricValue(value, metric) {
  if (metric === 'sales' || metric === 'basket_size') {
    return formatCurrency(value);
  }
  return formatNumber(value);
}

/**
 * Date helpers.
 *
 * These all accept an explicit reference date ("anchor") instead of reading the
 * browser clock. The app's notion of "today" is MAX(transaction_date) in the
 * warehouse, served by GET /config/date-anchor and held in DateAnchorContext.
 * Seeding date pickers from the browser clock is what made demos look broken as
 * the dataset aged: default ranges drifted past the end of the data and charts
 * came back empty.
 *
 * Passing no anchor falls back to the real current date, which is correct
 * whenever the data is fresh.
 */

function toISO(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Resolve a reference date into a Date object.
 * @param {string|Date|null|undefined} anchor - ISO date string or Date
 * @returns {Date}
 */
function refDate(anchor) {
  if (!anchor) return new Date();
  if (anchor instanceof Date) return new Date(anchor.getTime());
  // Parse as UTC midnight so the value round-trips without timezone drift.
  return new Date(`${String(anchor).slice(0, 10)}T00:00:00Z`);
}

/**
 * Get default date range for analytics (N days back from the anchor).
 * @param {number} daysBack - Number of days back for start date (default: 30)
 * @param {string|Date} [anchor] - Reference date; defaults to the browser clock
 * @returns {{ startDate: string, endDate: string }} ISO date strings
 */
export function getDefaultDateRange(daysBack = 30, anchor = null) {
  const end = refDate(anchor);
  const start = refDate(anchor);
  start.setDate(start.getDate() - daysBack);

  return {
    startDate: toISO(start),
    endDate: toISO(end)
  };
}

/**
 * Get default start date (N days before the anchor).
 * @param {number} daysBack - Number of days back (default: 30)
 * @param {string|Date} [anchor] - Reference date; defaults to the browser clock
 * @returns {string} ISO date string
 */
export function getDefaultStartDate(daysBack = 30, anchor = null) {
  const d = refDate(anchor);
  d.setDate(d.getDate() - daysBack);
  return toISO(d);
}

/**
 * Get the anchor date (the app's "today") as an ISO string.
 * @param {string|Date} [anchor] - Reference date; defaults to the browser clock
 * @returns {string} ISO date string
 */
export function getToday(anchor = null) {
  return toISO(refDate(anchor));
}

