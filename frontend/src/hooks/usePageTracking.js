import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../services/tracking';
import { useAuth } from '../contexts/AuthContext';

export function usePageTracking() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Only track if user is logged in
    if (user) {
      trackPageView(location.pathname);
    }
  }, [location.pathname, user]);
}

export default usePageTracking;

