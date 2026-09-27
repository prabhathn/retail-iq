import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { trackLogin, trackLogout } from '../services/tracking';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [moduleAccess, setModuleAccess] = useState({});
  const [moduleAccessLoaded, setModuleAccessLoaded] = useState(false);
  // Detailed module info including global settings (disabled reasons, etc.)
  const [moduleDetails, setModuleDetails] = useState({ user_access: {}, global_settings: {} });

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      initializeAuth();
    } else {
      setLoading(false);
      setModuleAccessLoaded(true);
    }
  }, [token]);

  // Fetch user and module access in parallel for faster loading
  const initializeAuth = async () => {
    try {
      // Fetch both in parallel
      const [userResponse, modulesResponse, detailedResponse] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/me/modules').catch(() => ({ data: {} })), // Don't fail if modules fail
        api.get('/auth/me/modules/detailed').catch(() => ({ data: { user_access: {}, global_settings: {} } }))
      ]);
      
      setUser(userResponse.data);
      setModuleAccess(modulesResponse.data);
      setModuleDetails(detailedResponse.data);
      setModuleAccessLoaded(true);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const fetchModuleAccess = async () => {
    try {
      const [response, detailedResponse] = await Promise.all([
        api.get('/auth/me/modules'),
        api.get('/auth/me/modules/detailed').catch(() => ({ data: { user_access: {}, global_settings: {} } }))
      ]);
      setModuleAccess(response.data);
      setModuleDetails(detailedResponse.data);
      setModuleAccessLoaded(true);
    } catch (error) {
      console.error('Failed to fetch module access:', error);
      setModuleAccess({});
    }
  };

  // Check if user has access to a specific module
  // This now accounts for both user permissions AND global settings
  const hasModuleAccess = (moduleKey) => {
    // If no moduleKey specified, always allow access
    if (!moduleKey) {
      return true;
    }
    // While loading, don't block access (will be checked again once loaded)
    if (!moduleAccessLoaded) {
      return true; // Show as accessible while loading
    }
    // If no module access data after loading, default based on user role
    if (!moduleAccess || Object.keys(moduleAccess).length === 0) {
      return user?.role === 'admin';
    }
    // The API now returns combined access (user permission AND global enabled)
    return moduleAccess[moduleKey] === true;
  };

  // Check access with strict mode (returns false while loading)
  const hasModuleAccessStrict = (moduleKey) => {
    // If no moduleKey specified, always allow access
    if (!moduleKey) {
      return true;
    }
    if (!moduleAccessLoaded) {
      return false; // Block while loading
    }
    if (!moduleAccess || Object.keys(moduleAccess).length === 0) {
      return user?.role === 'admin';
    }
    return moduleAccess[moduleKey] === true;
  };

  // Get the reason why a module is disabled (if any)
  // Returns: { isGloballyDisabled: boolean, reason: string | null }
  const getModuleDisabledInfo = (moduleKey) => {
    if (!moduleKey || !moduleAccessLoaded) {
      return { isGloballyDisabled: false, reason: null };
    }
    
    const globalSettings = moduleDetails.global_settings || {};
    const setting = globalSettings[moduleKey];
    
    if (setting && !setting.is_enabled) {
      return {
        isGloballyDisabled: true,
        reason: setting.disabled_reason || 'Module is currently disabled'
      };
    }
    
    return { isGloballyDisabled: false, reason: null };
  };

  // Check if a module is globally disabled (separate from user permissions)
  const isModuleGloballyDisabled = (moduleKey) => {
    const { isGloballyDisabled } = getModuleDisabledInfo(moduleKey);
    return isGloballyDisabled;
  };

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem('token', access_token);
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    
    // Fetch module access immediately after login
    try {
      const modulesResponse = await api.get('/auth/me/modules');
      setModuleAccess(modulesResponse.data);
      setModuleAccessLoaded(true);
    } catch (e) {
      console.error('Failed to fetch modules on login:', e);
    }
    
    // Track login
    trackLogin();
    
    return userData;
  };

  const register = async (email, password, fullName, company) => {
    const response = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName,
      company
    });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem('token', access_token);
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    
    // Track login after registration
    trackLogin();
    
    return userData;
  };

  const logout = () => {
    // Track logout before clearing credentials
    trackLogout();
    
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login, 
      register, 
      logout, 
      loading,
      moduleAccess,
      moduleAccessLoaded,
      moduleDetails,
      hasModuleAccess,
      hasModuleAccessStrict,
      getModuleDisabledInfo,
      isModuleGloballyDisabled,
      refreshModuleAccess: fetchModuleAccess
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

