import { useState, Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  Store, 
  BarChart3, 
  LogOut,
  ChevronRight,
  ChevronDown,
  Leaf,
  Shield,
  Image,
  Megaphone,
  Send,
  Gauge,
  LayoutGrid,
  Clock,
  Truck,
  Activity,
  FileText,
  CheckSquare,
  Sparkles,
  Network,
  Briefcase,
  TrendingUp,
  Zap
} from 'lucide-react';

// Navigation sections with module keys for access control
const navSections = [
  {
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard', moduleKey: 'dashboard' },
      { path: '/ai-assistant', icon: Sparkles, label: 'AI Assistant', moduleKey: 'ai_assistant' },
      { path: '/automations', icon: Zap, label: 'Automations', moduleKey: 'automations' },
    ]
  },
  {
    heading: 'Audience',
    items: [
      { path: '/audience/assistant', icon: Sparkles, label: 'Assistant', moduleKey: 'audience.assistant' },
      { path: '/analytics/shopper-cohorts', icon: Users, label: 'Shopper Cohorts', moduleKey: 'audience.shopper_cohorts' },
      { path: '/audience/market-cohorts', icon: Network, label: 'Market Cohorts', moduleKey: 'audience.market_cohorts' },
    ]
  },
  {
    heading: 'Insights',
    items: [
      { path: '/insights/assistant', icon: Sparkles, label: 'Assistant', moduleKey: 'insights.assistant' },
      { path: '/analytics/category-sales', icon: BarChart3, label: 'Sales Analytics', moduleKey: 'insights.sales_analytics' },
      { path: '/analytics/market-basket', icon: ShoppingCart, label: 'Market Basket', moduleKey: 'insights.market_basket' },
      { path: '/analytics/store-performance', icon: Store, label: 'Store Performance', moduleKey: 'insights.store_performance' },
    ]
  },
  {
    heading: 'Activation',
    items: [
      { path: '/activation/assistant', icon: Sparkles, label: 'Assistant', moduleKey: 'activation.assistant' },
      { path: '/activation/creatives', icon: Image, label: 'Creatives', moduleKey: 'activation.creatives' },
      { path: '/activation/campaigns', icon: Megaphone, label: 'Campaigns', moduleKey: 'activation.campaigns' },
      { path: '/activation/destinations', icon: Send, label: 'Destinations', moduleKey: 'activation.destinations' },
      { path: '/activation/measurement', icon: Gauge, label: 'Measurement', moduleKey: 'activation.measurement' },
    ]
  },
  {
    heading: 'Operations',
    items: [
      { path: '/operations/assistant', icon: Sparkles, label: 'Assistant', moduleKey: 'operations.assistant' },
      { type: 'subheading', label: 'Products' },
      { path: '/operations/product-catalog', icon: LayoutGrid, label: 'Product Catalog', moduleKey: 'operations.product_catalog' },
      { path: '/operations/store-assortment', icon: Store, label: 'Store Assortment', moduleKey: 'operations.store_assortment' },
      { path: '/operations/availability', icon: Clock, label: 'Availability', moduleKey: 'operations.availability' },
      { type: 'subheading', label: 'Supply' },
      { path: '/operations/fulfillment', icon: Truck, label: 'Fulfillment', moduleKey: 'operations.fulfillment' },
      { path: '/operations/performance', icon: Activity, label: 'Performance', moduleKey: 'operations.performance' },
      { type: 'subheading', label: 'Planning' },
      { path: '/operations/labor', icon: Briefcase, label: 'Labor', moduleKey: 'operations.labor' },
      { path: '/operations/demand', icon: TrendingUp, label: 'Demand', moduleKey: 'operations.demand' },
    ]
  },
  {
    heading: 'Partnership',
    items: [
      { path: '/partnership/assistant', icon: Sparkles, label: 'Assistant', moduleKey: 'partnership.assistant' },
      { path: '/partnership/agreements', icon: FileText, label: 'Agreements', moduleKey: 'partnership.agreements' },
      { path: '/partnership/compliance', icon: CheckSquare, label: 'Compliance', moduleKey: 'partnership.compliance' },
    ]
  },
];

export default function Layout() {
  const { user, logout, hasModuleAccess, moduleAccessLoaded } = useAuth();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState(() => {
    // Initialize with all sections collapsed by default
    return navSections.reduce((acc, section) => {
      if (section.heading) {
        acc[section.heading] = false;
      }
      return acc;
    }, {});
  });

  const toggleSection = (heading) => {
    setExpandedSections(prev => ({
      ...prev,
      [heading]: !prev[heading]
    }));
  };
  
  return (
    <div className="h-screen bg-slate-950 flex overflow-hidden">
      {/* Sidebar - fixed width, full height, with internal scrolling */}
      <aside className="w-72 h-full bg-slate-900/50 border-r border-white/5 flex flex-col flex-shrink-0">
        {/* Logo - fixed at top */}
        <div className="p-6 border-b border-white/5 flex-shrink-0">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-retail-400 to-retail-600 flex items-center justify-center">
              <Leaf className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-white text-lg">RetailIQ</h1>
              <p className="text-xs text-slate-400">Shopper Intelligence</p>
            </div>
          </Link>
        </div>
        
        {/* Navigation - scrollable middle section */}
        <nav className="flex-1 p-4 overflow-y-auto min-h-0">
          <div className="space-y-3">
            {navSections.map((section, sectionIndex) => {
              // Check if section has any accessible items (excluding subheadings)
              const accessibleItems = section.items.filter(item => 
                item.type !== 'subheading' && (!moduleAccessLoaded || hasModuleAccess(item.moduleKey))
              );
              
              // Hide entire section if no accessible items
              if (moduleAccessLoaded && accessibleItems.length === 0) return null;
              
              const isExpanded = section.heading ? expandedSections[section.heading] : true;
              
              return (
                <div key={sectionIndex}>
                  {section.heading ? (
                    <button
                      onClick={() => toggleSection(section.heading)}
                      className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-retail-500"></span>
                        {section.heading}
                      </span>
                      <ChevronDown 
                        className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                          isExpanded ? 'rotate-0' : '-rotate-90'
                        }`} 
                      />
                    </button>
                  ) : null}
                  
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-0.5 overflow-hidden"
                      >
                        {section.items.map((item, itemIndex) => {
                          // Render subheading - check if any items after it have access
                          if (item.type === 'subheading') {
                            // Look ahead to find items until next subheading
                            const itemsInGroup = [];
                            for (let i = itemIndex + 1; i < section.items.length; i++) {
                              if (section.items[i].type === 'subheading') break;
                              itemsInGroup.push(section.items[i]);
                            }
                            // Only show subheading if at least one item in group is accessible
                            const hasAccessibleItems = moduleAccessLoaded 
                              ? itemsInGroup.some(i => hasModuleAccess(i.moduleKey))
                              : true;
                            
                            if (!hasAccessibleItems) return null;
                            
                            return (
                              <li key={`subheading-${itemIndex}`} className="pt-2 first:pt-0">
                                <div className="px-4 py-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                                  {item.label}
                                </div>
                              </li>
                            );
                          }
                          
                          const isActive = location.pathname === item.path;
                          const hasAccess = hasModuleAccess(item.moduleKey);
                          const isLoading = !moduleAccessLoaded;
                          
                          // Show loading state while permissions are loading
                          if (isLoading) {
                            return (
                              <li key={item.path}>
                                <div className="flex items-center gap-3 px-4 py-1.5 rounded-lg text-slate-400">
                                  <item.icon className="w-4 h-4 text-slate-500" />
                                  <span className="text-sm">{item.label}</span>
                                  <span className="ml-auto w-3 h-3 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin"></span>
                                </div>
                              </li>
                            );
                          }
                          
                          // If no access, hide the item completely
                          if (!hasAccess) {
                            return null;
                          }
                          
                          return (
                            <li key={item.path}>
                              <Link
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-1.5 rounded-lg transition-all duration-200 group ${
                                  isActive
                                    ? 'bg-retail-500/20 text-retail-400'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                <item.icon className={`w-4 h-4 ${isActive ? 'text-retail-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                                <span className="text-sm">{item.label}</span>
                                {item.badge && (
                                  <span className="ml-1 text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded">
                                    {item.badge}
                                  </span>
                                )}
                                {isActive && (
                                  <ChevronRight className="w-4 h-4 ml-auto text-retail-400" />
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </nav>
        
        {/* User section - fixed at bottom */}
        <div className="p-4 border-t border-white/5 flex-shrink-0">
          {/* Admin Portal Link */}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="flex items-center gap-2 px-4 py-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all"
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">Admin Portal</span>
              <ChevronRight className="w-4 h-4 ml-auto" />
            </Link>
          )}
          
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-semibold">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
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
          <Suspense fallback={
            <div className="h-full flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                <p className="text-slate-400 text-sm">Loading page...</p>
              </div>
            </div>
          }>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

