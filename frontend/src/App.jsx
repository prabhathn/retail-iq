import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth } from './contexts/AuthContext';
import { usePageTracking } from './hooks/usePageTracking';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// Eagerly load critical path components
import Login from './pages/Login';
import Layout from './components/Layout';

// Lazy load page components - they're loaded on-demand when navigating
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const Automations = lazy(() => import('./pages/Automations'));
const CategorySales = lazy(() => import('./pages/analytics/CategorySales'));
const MarketBasket = lazy(() => import('./pages/analytics/MarketBasket'));
const ShopperCohorts = lazy(() => import('./pages/analytics/ShopperCohorts'));
const StorePerformance = lazy(() => import('./pages/analytics/StorePerformance'));

// Lazy load activation pages
const Creatives = lazy(() => import('./pages/activation/Creatives'));
const Campaigns = lazy(() => import('./pages/activation/Campaigns'));
const Destinations = lazy(() => import('./pages/activation/Destinations'));

// Lazy load operations pages
const ProductCatalog = lazy(() => import('./pages/operations/ProductCatalog'));
const StoreAssortment = lazy(() => import('./pages/operations/StoreAssortment'));

// Lazy load partnership pages
const Agreements = lazy(() => import('./pages/partnership/Agreements'));

// Lazy load admin pages (separate chunk)
const AdminLayout = lazy(() => import('./components/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminActivities = lazy(() => import('./pages/admin/AdminActivities'));
const AdminCohorts = lazy(() => import('./pages/admin/AdminCohorts'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminScopes = lazy(() => import('./pages/admin/AdminScopes'));
const AdminModules = lazy(() => import('./pages/admin/AdminModules'));
const AdminDatasets = lazy(() => import('./pages/admin/AdminDatasets'));

// Loading fallback component - matches app's dark theme to prevent white flash
function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-retail-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Component to protect individual modules/reports
function ProtectedModule({ moduleKey, children }) {
  const { hasModuleAccessStrict, moduleAccessLoaded } = useAuth();
  
  // Show loading while permissions are being fetched
  if (!moduleAccessLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-retail-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  // Check access
  if (!hasModuleAccessStrict(moduleKey)) {
    return <AccessDenied />;
  }
  
  return children;
}

// Access denied page component
function AccessDenied() {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-display font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-6 max-w-md">
          You don't have permission to access this module. Please contact your administrator if you believe this is an error.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-retail-500 to-retail-600 text-white font-medium rounded-xl hover:from-retail-600 hover:to-retail-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function AppContent() {
  // Track page views
  usePageTracking();
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={
          <ProtectedModule moduleKey="dashboard">
            <Dashboard />
          </ProtectedModule>
        } />
        
        {/* AI Assistant - below Dashboard, above sections */}
        <Route path="ai-assistant" element={
          <ProtectedModule moduleKey="ai_assistant">
            <AIAssistant />
          </ProtectedModule>
        } />
        
        {/* Automations */}
        <Route path="automations" element={
          <ProtectedModule moduleKey="automations">
            <Automations />
          </ProtectedModule>
        } />
        
        <Route path="analytics/category-sales" element={
          <ProtectedModule moduleKey="insights.sales_analytics">
            <CategorySales />
          </ProtectedModule>
        } />
        <Route path="analytics/market-basket" element={
          <ProtectedModule moduleKey="insights.market_basket">
            <MarketBasket />
          </ProtectedModule>
        } />
        <Route path="analytics/shopper-cohorts" element={
          <ProtectedModule moduleKey="audience.shopper_cohorts">
            <ShopperCohorts />
          </ProtectedModule>
        } />
        <Route path="analytics/store-performance" element={
          <ProtectedModule moduleKey="insights.store_performance">
            <StorePerformance />
          </ProtectedModule>
        } />
        <Route path="activation/creatives" element={
          <ProtectedModule moduleKey="activation.creatives">
            <Creatives />
          </ProtectedModule>
        } />
        <Route path="activation/campaigns" element={
          <ProtectedModule moduleKey="activation.campaigns">
            <Campaigns />
          </ProtectedModule>
        } />
        <Route path="activation/destinations" element={
          <ProtectedModule moduleKey="activation.destinations">
            <Destinations />
          </ProtectedModule>
        } />
        
        {/* Operations Routes */}
        <Route path="operations/product-catalog" element={
          <ProtectedModule moduleKey="operations.product_catalog">
            <ProductCatalog />
          </ProtectedModule>
        } />
        <Route path="operations/store-assortment" element={
          <ProtectedModule moduleKey="operations.store_assortment">
            <StoreAssortment />
          </ProtectedModule>
        } />
        
        {/* Partnership Routes */}
        <Route path="partnership/agreements" element={
          <ProtectedModule moduleKey="partnership.agreements">
            <Agreements />
          </ProtectedModule>
        } />
      </Route>
      
      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="activities" element={<AdminActivities />} />
        <Route path="cohorts" element={<AdminCohorts />} />
        <Route path="scopes" element={<AdminScopes />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="modules" element={<AdminModules />} />
        <Route path="datasets" element={<AdminDatasets />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AppContent />
    </Suspense>
  );
}

export default App;

