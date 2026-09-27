import api from './api';

// Generate or retrieve session ID
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('session_id', sessionId);
  }
  return sessionId;
};

// Object types for tracking
export const OBJECT_TYPES = {
  CAMPAIGN: 'campaign',
  DESTINATION: 'destination',
  CREATIVE: 'creative',
  COHORT: 'cohort',
  USER: 'user',
};

// Track user activity
export const trackActivity = async (actionType, actionDetail = null, metadata = null) => {
  try {
    await api.post('/tracking/activity', {
      action_type: actionType,
      action_detail: actionDetail,
      metadata: metadata,
      session_id: getSessionId()
    });
  } catch (error) {
    // Silently fail - don't disrupt user experience
    console.debug('Activity tracking failed:', error);
  }
};

// Track page views
export const trackPageView = (pagePath) => {
  trackActivity('page_view', pagePath, { timestamp: new Date().toISOString() });
};

// Track button clicks
export const trackClick = (buttonName, metadata = null) => {
  trackActivity('button_click', buttonName, metadata);
};

// Track report runs (called from analytics pages)
export const trackReportRun = (reportType, parameters) => {
  trackActivity('report_run', reportType, { parameters });
};

// Track login
export const trackLogin = () => {
  trackActivity('login', null, { timestamp: new Date().toISOString() });
};

// Track logout
export const trackLogout = () => {
  trackActivity('logout', null, { timestamp: new Date().toISOString() });
};

// ============================================
// Object Action Tracking (CRUD Operations)
// ============================================

/**
 * Track object creation
 * @param {string} objectType - Type of object (use OBJECT_TYPES constants)
 * @param {string|number} objectId - ID of the created object
 * @param {string} objectName - Name/title of the object
 * @param {object} additionalData - Any additional metadata
 */
export const trackObjectCreate = (objectType, objectId, objectName, additionalData = {}) => {
  trackActivity('object_create', objectType, {
    object_id: objectId,
    object_name: objectName,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
};

/**
 * Track object deletion
 * @param {string} objectType - Type of object (use OBJECT_TYPES constants)
 * @param {string|number} objectId - ID of the deleted object
 * @param {string} objectName - Name/title of the object
 * @param {object} additionalData - Any additional metadata
 */
export const trackObjectDelete = (objectType, objectId, objectName, additionalData = {}) => {
  trackActivity('object_delete', objectType, {
    object_id: objectId,
    object_name: objectName,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
};

/**
 * Track object modification/update
 * @param {string} objectType - Type of object (use OBJECT_TYPES constants)
 * @param {string|number} objectId - ID of the modified object
 * @param {string} objectName - Name/title of the object
 * @param {string[]} changedFields - Array of field names that were changed
 * @param {object} additionalData - Any additional metadata
 */
export const trackObjectModify = (objectType, objectId, objectName, changedFields = [], additionalData = {}) => {
  trackActivity('object_modify', objectType, {
    object_id: objectId,
    object_name: objectName,
    changed_fields: changedFields,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
};

/**
 * Track object status change (activate, pause, schedule, etc.)
 * @param {string} objectType - Type of object
 * @param {string|number} objectId - ID of the object
 * @param {string} objectName - Name of the object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 */
export const trackObjectStatusChange = (objectType, objectId, objectName, oldStatus, newStatus) => {
  trackActivity('object_status_change', objectType, {
    object_id: objectId,
    object_name: objectName,
    old_status: oldStatus,
    new_status: newStatus,
    timestamp: new Date().toISOString()
  });
};

/**
 * Track object duplication
 * @param {string} objectType - Type of object
 * @param {string|number} sourceId - ID of the source object
 * @param {string|number} newId - ID of the new duplicated object
 * @param {string} objectName - Name of the object
 */
export const trackObjectDuplicate = (objectType, sourceId, newId, objectName) => {
  trackActivity('object_duplicate', objectType, {
    source_id: sourceId,
    new_id: newId,
    object_name: objectName,
    timestamp: new Date().toISOString()
  });
};

export default {
  trackActivity,
  trackPageView,
  trackClick,
  trackReportRun,
  trackLogin,
  trackLogout,
  trackObjectCreate,
  trackObjectDelete,
  trackObjectModify,
  trackObjectStatusChange,
  trackObjectDuplicate,
  OBJECT_TYPES
};

