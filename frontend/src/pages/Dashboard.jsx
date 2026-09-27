import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  ShoppingCart, 
  Users, 
  Store, 
  Package,
  DollarSign,
  ShoppingBag,
  ArrowUpRight,
  Lock,
  Megaphone,
  Zap,
  Image,
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
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDashboard } from '../contexts/DashboardContext';
import api from '../services/api';

// Report tiles organized by section
const reportSections = [
  {
    name: 'Audience',
    description: 'Understand and segment your shoppers based on behavior and preferences',
    color: 'from-orange-500 to-red-500',
    iconColor: 'text-orange-400',
    reports: [
      { id: 'shopper-cohorts', title: 'Shopper Cohorts', icon: Users, path: '/analytics/shopper-cohorts', moduleKey: 'audience.shopper_cohorts' },
      { id: 'market-cohorts', title: 'Market Cohorts', icon: Network, path: '/audience/market-cohorts', moduleKey: 'audience.market_cohorts' },
    ]
  },
  {
    name: 'Insights',
    description: 'Analyze sales patterns, market basket trends, and store performance',
    color: 'from-blue-500 to-cyan-500',
    iconColor: 'text-blue-400',
    reports: [
      { id: 'sales-analytics', title: 'Sales Analytics', icon: BarChart3, path: '/analytics/category-sales', moduleKey: 'insights.sales_analytics' },
      { id: 'market-basket', title: 'Market Basket', icon: ShoppingCart, path: '/analytics/market-basket', moduleKey: 'insights.market_basket' },
      { id: 'store-performance', title: 'Store Performance', icon: Store, path: '/analytics/store-performance', moduleKey: 'insights.store_performance' },
    ]
  },
  {
    name: 'Activation',
    description: 'Create and manage campaigns, creatives, and audience destinations',
    color: 'from-purple-500 to-pink-500',
    iconColor: 'text-purple-400',
    reports: [
      { id: 'creatives', title: 'Creatives', icon: Image, path: '/activation/creatives', moduleKey: 'activation.creatives' },
      { id: 'campaigns', title: 'Campaigns', icon: Megaphone, path: '/activation/campaigns', moduleKey: 'activation.campaigns' },
      { id: 'destinations', title: 'Destinations', icon: Send, path: '/activation/destinations', moduleKey: 'activation.destinations' },
      { id: 'measurement', title: 'Measurement', icon: Gauge, path: '/activation/measurement', moduleKey: 'activation.measurement' },
    ]
  },
  {
    name: 'Operations',
    description: 'Manage products, inventory, fulfillment, and operational performance',
    color: 'from-slate-500 to-slate-400',
    iconColor: 'text-slate-400',
    reports: [
      { id: 'product-catalog', title: 'Product Catalog', icon: LayoutGrid, path: '/operations/product-catalog', moduleKey: 'operations.product_catalog' },
      { id: 'store-assortment', title: 'Store Assortment', icon: Store, path: '/operations/store-assortment', moduleKey: 'operations.store_assortment' },
      { id: 'availability', title: 'Availability', icon: Clock, path: '/operations/availability', moduleKey: 'operations.availability' },
      { id: 'fulfillment', title: 'Fulfillment', icon: Truck, path: '/operations/fulfillment', moduleKey: 'operations.fulfillment' },
      { id: 'labor', title: 'Labor', icon: Briefcase, path: '/operations/labor', moduleKey: 'operations.labor' },
      { id: 'demand', title: 'Demand', icon: TrendingUp, path: '/operations/demand', moduleKey: 'operations.demand' },
      { id: 'performance', title: 'Performance', icon: Activity, path: '/operations/performance', moduleKey: 'operations.performance' },
    ]
  },
  {
    name: 'Partnership',
    description: 'Manage agreements, contracts, and compliance documentation',
    color: 'from-teal-500 to-emerald-500',
    iconColor: 'text-teal-400',
    reports: [
      { id: 'agreements', title: 'Agreements', icon: FileText, path: '/partnership/agreements', moduleKey: 'partnership.agreements' },
      { id: 'compliance', title: 'Compliance', icon: CheckSquare, path: '/partnership/compliance', moduleKey: 'partnership.compliance' },
    ]
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};

export default function Dashboard() {
  const { hasModuleAccess, moduleAccessLoaded } = useAuth();
  const { summary, summaryLoading, fetchSummary } = useDashboard();
  
  // Activity counts state
  const [activityCounts, setActivityCounts] = useState({
    activeCampaigns: 0,
    runningAutomations: 0,
    loading: true,
  });
  
  // Fetch summary and activity counts on mount
  useEffect(() => {
    fetchSummary();
    fetchActivityCounts();
  }, []);
  
  const fetchActivityCounts = async () => {
    try {
      // Fetch campaigns and automations counts in parallel
      const [campaignsRes, automationsRes] = await Promise.all([
        api.get('/campaigns?status=active&limit=1').catch(() => ({ data: { total: 0 } })),
        api.get('/automations').catch(() => ({ data: { automations: [] } })),
      ]);
      
      const activeCampaigns = campaignsRes.data?.total || 0;
      const runningAutomations = (automationsRes.data?.automations || []).filter(a => a.status === 'running').length;
      
      setActivityCounts({
        activeCampaigns,
        runningAutomations,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to fetch activity counts:', error);
      setActivityCounts(prev => ({ ...prev, loading: false }));
    }
  };
  
  const loading = summaryLoading && !summary;
  const hasActiveActivities = activityCounts.activeCampaigns > 0 || activityCounts.runningAutomations > 0;
  
  const formatNumber = useCallback((num) => {
    if (!num) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  }, []);
  
  const formatCurrency = useCallback((num) => {
    if (!num) return '—';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toLocaleString()}`;
  }, []);
  
  return (
    <div className="p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Dashboard
        </h1>
        <p className="text-slate-400">
          Overview of your retail analytics and quick access to reports
        </p>
      </motion.div>
      
      {/* ========== SECTION 1: Performance ========== */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mb-10"
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-retail-500"></div>
          Performance
          <span className="text-xs text-slate-500 font-normal ml-2">Last 30 days</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-sm text-slate-400">Transactions</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {loading ? <span className="shimmer inline-block w-20 h-7 rounded"></span> : formatNumber(summary?.summary?.TOTAL_TRANSACTIONS)}
            </p>
          </motion.div>
          
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-green-400" />
              </div>
              <p className="text-sm text-slate-400">Total Sales</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {loading ? <span className="shimmer inline-block w-20 h-7 rounded"></span> : formatCurrency(summary?.summary?.TOTAL_SALES)}
            </p>
          </motion.div>
          
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-sm text-slate-400">Unique Shoppers</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {loading ? <span className="shimmer inline-block w-20 h-7 rounded"></span> : formatNumber(summary?.summary?.TOTAL_SHOPPERS)}
            </p>
          </motion.div>
          
          <motion.div variants={itemVariants} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Package className="w-4 h-4 text-orange-400" />
              </div>
              <p className="text-sm text-slate-400">Avg Basket Size</p>
            </div>
            <p className="text-2xl font-bold text-white">
              {loading ? <span className="shimmer inline-block w-20 h-7 rounded"></span> : formatCurrency(summary?.summary?.AVG_BASKET_SIZE)}
            </p>
          </motion.div>
        </div>
      </motion.div>
      
      {/* ========== SECTION 2: Actions & Automations (only if active) ========== */}
      {!activityCounts.loading && hasActiveActivities && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
            Actions & Automations
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {activityCounts.activeCampaigns > 0 && (
              <Link to="/activation/campaigns">
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="glass-card rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-purple-500/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Megaphone className="w-5 h-5 text-white" />
                    </div>
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                      Active
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1">{activityCounts.activeCampaigns}</p>
                  <p className="text-sm text-slate-400">Active Campaigns</p>
                </motion.div>
              </Link>
            )}
            
            {activityCounts.runningAutomations > 0 && (
              <Link to="/automations">
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="glass-card rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-amber-500/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                      Running
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1">{activityCounts.runningAutomations}</p>
                  <p className="text-sm text-slate-400">Running Automations</p>
                </motion.div>
              </Link>
            )}
          </div>
        </motion.div>
      )}
      
      {/* ========== SECTION 3: Reports ========== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
          Reports
        </h2>
        
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {reportSections.map((section) => {
            // Filter reports that user has access to
            const accessibleReports = section.reports.filter(report => 
              !moduleAccessLoaded || hasModuleAccess(report.moduleKey)
            );
            
            // Don't show section if no accessible reports
            if (accessibleReports.length === 0) return null;
            
            return (
              <motion.div
                key={section.name}
                variants={itemVariants}
                className="glass-card rounded-2xl p-5 relative overflow-hidden"
              >
                {/* Gradient accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${section.color}`}></div>
                
                {/* Section header */}
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-white mb-1">
                    {section.name}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {section.description}
                  </p>
                </div>
                
                {/* Reports grid - only show accessible reports */}
                <div className="grid grid-cols-3 gap-2">
                  {accessibleReports.map((report) => {
                    const Icon = report.icon;
                    
                    return (
                      <Link key={report.id} to={report.path} className="group">
                        <div className="flex flex-col items-center justify-start p-2 rounded-lg transition-all h-[88px] hover:bg-white/5 cursor-pointer">
                          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center mb-1.5 flex-shrink-0 group-hover:bg-white/10">
                            <Icon className={`w-4 h-4 ${section.iconColor}`} />
                          </div>
                          <span className="text-xs font-medium text-center leading-tight text-slate-300">
                            {report.title}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}
