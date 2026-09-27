import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Activity, 
  LogOut,
  ChevronRight,
  Shield,
  ArrowLeft,
  UserSquare2,
  Settings,
  LayoutGrid,
  Database
} from 'lucide-react';

// Navigation organized by sections
const navSections = [
  {
    id: 'dashboard',
    items: [
      { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    items: [
      { path: '/admin/users', icon: Users, label: 'Users' },
      { path: '/admin/scopes', icon: Shield, label: 'Scope Management' },
      { path: '/admin/modules', icon: LayoutGrid, label: 'Active Modules' },
    ],
  },
  {
    id: 'usage',
    label: 'Usage',
    items: [
      { path: '/admin/activities', icon: Activity, label: 'Activity' },
      { path: '/admin/reports', icon: FileText, label: 'Reports Run' },
      { path: '/admin/cohorts', icon: UserSquare2, label: 'Cohorts' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    items: [
      { path: '/admin/datasets', icon: Database, label: 'Dataset Connections' },
      { path: '/admin/settings', icon: Settings, label: 'Ad Config' },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  
  // Check if user is admin
  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  
  return (
    <div className="h-screen bg-slate-950 flex overflow-hidden">
      {/* Sidebar - fixed width, full height */}
      <aside className="w-72 h-full bg-slate-900/50 border-r border-white/5 flex flex-col flex-shrink-0">
        {/* Logo - fixed at top */}
        <div className="p-6 border-b border-white/5 flex-shrink-0">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-white text-lg">RetailIQ</h1>
              <p className="text-xs text-amber-400">Admin Portal</p>
            </div>
          </Link>
        </div>
        
        {/* Back to App - fixed */}
        <div className="px-4 pt-4 flex-shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to App</span>
          </Link>
        </div>
        
        {/* Navigation - scrollable */}
        <nav className="flex-1 p-4 overflow-y-auto min-h-0">
          <div className="space-y-4">
            {navSections.map((section) => (
              <div key={section.id}>
                {/* Section Header */}
                {section.label && (
                  <h3 className="px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {section.label}
                  </h3>
                )}
                
                {/* Section Items */}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group ${
                            isActive
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                          <span className="text-sm font-medium">{item.label}</span>
                          {isActive && (
                            <ChevronRight className="w-4 h-4 ml-auto text-amber-400" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        
        {/* User section - fixed at bottom */}
        <div className="p-4 border-t border-white/5 flex-shrink-0">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-semibold">
                {user?.full_name?.charAt(0) || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-amber-400 truncate">Administrator</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
      
      {/* Main content - scrolls independently */}
      <main className="flex-1 h-full overflow-y-auto overflow-x-hidden">
        <div className="min-h-full bg-dark-mesh">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

