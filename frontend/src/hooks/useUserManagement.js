import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * Custom hook for user management data and operations.
 * Handles fetching users, scopes, module access, and CRUD operations.
 */
export function useUserManagement() {
  // Data state
  const [users, setUsers] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [scopeOptions, setScopeOptions] = useState({ categories: [], brands: [] });
  const [availableModules, setAvailableModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Selected user state
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [moduleAccess, setModuleAccess] = useState({});
  const [moduleAccessDirty, setModuleAccessDirty] = useState(false);
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initial data fetch
  useEffect(() => {
    fetchUsers();
    fetchScopes();
    fetchScopeOptions();
    fetchAvailableModules();
  }, []);

  // Fetch functions
  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchScopes = useCallback(async () => {
    try {
      const response = await api.get('/admin/scopes');
      setScopes(response.data.scopes);
    } catch (error) {
      console.error('Failed to fetch scopes:', error);
    }
  }, []);

  const fetchScopeOptions = useCallback(async () => {
    try {
      const response = await api.get('/admin/scope-options');
      setScopeOptions(response.data);
    } catch (error) {
      console.error('Failed to fetch scope options:', error);
    }
  }, []);

  const fetchAvailableModules = useCallback(async () => {
    try {
      const response = await api.get('/admin/modules/available');
      setAvailableModules(response.data.modules);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  }, []);

  const fetchUserModuleAccess = useCallback(async (userId) => {
    try {
      const response = await api.get(`/admin/users/${userId}/modules`);
      setModuleAccess(response.data.modules);
      setModuleAccessDirty(false);
    } catch (error) {
      console.error('Failed to fetch module access:', error);
      setModuleAccess({});
    }
  }, []);

  const fetchUserDetail = useCallback(async (userId) => {
    try {
      const response = await api.get(`/admin/users/${userId}`);
      setUserDetail(response.data);
      await fetchUserModuleAccess(userId);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user detail:', error);
      return null;
    }
  }, [fetchUserModuleAccess]);

  // User selection
  const selectUser = useCallback(async (user) => {
    setSelectedUser(user);
    setSaveSuccess(false);
    await fetchUserDetail(user.id);
  }, [fetchUserDetail]);

  // Save operations
  const saveUserChanges = useCallback(async (editForm) => {
    if (!userDetail) return false;
    
    setSaving(true);
    try {
      await api.put(`/admin/users/${userDetail.user.id}`, editForm);
      setSaveSuccess(true);
      fetchUsers();
      fetchUserDetail(userDetail.user.id);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      console.error('Failed to save user:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [userDetail, fetchUsers, fetchUserDetail]);

  const saveModuleAccess = useCallback(async () => {
    if (!userDetail) return false;
    
    setSaving(true);
    try {
      await api.put(`/admin/users/${userDetail.user.id}/modules`, {
        modules: moduleAccess
      });
      setModuleAccessDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      console.error('Failed to save module access:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [userDetail, moduleAccess]);

  const toggleModuleAccess = useCallback((moduleKey) => {
    setModuleAccess(prev => ({
      ...prev,
      [moduleKey]: !prev[moduleKey]
    }));
    setModuleAccessDirty(true);
  }, []);

  const grantAllModules = useCallback(async () => {
    if (!userDetail) return;
    setSaving(true);
    try {
      await api.post(`/admin/users/${userDetail.user.id}/modules/grant-all`);
      await fetchUserModuleAccess(userDetail.user.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to grant all access:', error);
    } finally {
      setSaving(false);
    }
  }, [userDetail, fetchUserModuleAccess]);

  const revokeAllModules = useCallback(async () => {
    if (!userDetail) return;
    setSaving(true);
    try {
      await api.post(`/admin/users/${userDetail.user.id}/modules/revoke-all`);
      await fetchUserModuleAccess(userDetail.user.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to revoke access:', error);
    } finally {
      setSaving(false);
    }
  }, [userDetail, fetchUserModuleAccess]);

  const createCustomScope = useCallback(async (customScope) => {
    if (!userDetail || !customScope.name.trim()) return false;
    
    const validEntitlements = customScope.entitlements.filter(e => 
      e.tenant_type === 'all' || e.tenant_id
    );
    
    if (validEntitlements.length === 0) {
      throw new Error('Please add at least one valid entitlement');
    }
    
    setSaving(true);
    try {
      await api.post(`/admin/users/${userDetail.user.id}/scope`, {
        ...customScope,
        entitlements: validEntitlements
      });
      
      // Sync to Snowflake
      await api.post('/admin/scopes/sync-to-snowflake');
      
      fetchScopes();
      fetchUsers();
      fetchUserDetail(userDetail.user.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      console.error('Failed to create scope:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }, [userDetail, fetchScopes, fetchUsers, fetchUserDetail]);

  return {
    // Data
    users,
    scopes,
    scopeOptions,
    availableModules,
    total,
    loading,
    
    // Selected user
    selectedUser,
    userDetail,
    moduleAccess,
    moduleAccessDirty,
    
    // UI state
    saving,
    saveSuccess,
    
    // Actions
    selectUser,
    saveUserChanges,
    saveModuleAccess,
    toggleModuleAccess,
    grantAllModules,
    revokeAllModules,
    createCustomScope,
    
    // Refresh functions
    refreshUsers: fetchUsers,
    refreshScopes: fetchScopes,
  };
}

export default useUserManagement;

