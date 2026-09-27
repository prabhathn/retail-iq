import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, 
  FileText, 
  Activity, 
  TrendingUp,
  Clock,
  BarChart3,
  ArrowUpRight,
  UserSquare2,
  Loader2
} from 'lucide-react';
import api from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch admin stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.users?.total || 0,
      subtitle: `${stats?.users?.active || 0} active`,
      icon: Users,
      color: 'blue',
      link: '/admin/users'
    },
    {
      title: 'Reports Run (24h)',
      value: stats?.reports?.last_24h || 0,
      subtitle: `${stats?.reports?.total || 0} total`,
      icon: FileText,
      color: 'green',
      link: '/admin/reports'
    },
    {
      title: 'Activities (24h)',
      value: stats?.activities?.last_24h || 0,
      subtitle: 'Page views, clicks, etc.',
      icon: Activity,
      color: 'purple',
      link: '/admin/activities'
    },
    {
      title: 'Shopper Cohorts',
      value: stats?.cohorts?.total || 0,
      subtitle: `${stats?.cohorts?.last_24h || 0} created today`,
      icon: UserSquare2,
      color: 'orange',
      link: '/admin/cohorts'
    }
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-display font-bold text-white mb-2">
          Admin Dashboard
        </h1>
        <p className="text-slate-400">
          Monitor user activity, reports, and system health
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link to={card.link}>
              <div className="glass-card rounded-2xl p-6 hover:bg-white/10 transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-${card.color}-500/20 flex items-center justify-center`}>
                    <card.icon className={`w-6 h-6 text-${card.color}-400`} />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                </div>
                <p className="text-3xl font-bold text-white mb-1">
                  {card.value.toLocaleString()}
                </p>
                <p className="text-lg text-white font-medium">{card.title}</p>
                <p className="text-sm text-slate-400">{card.subtitle}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Reports by Type */}
      {stats?.reports?.by_type && Object.keys(stats.reports.by_type).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card rounded-2xl p-6 mb-6"
        >
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-retail-400" />
            Reports by Type
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.reports.by_type).map(([type, count]) => (
              <div key={type} className="bg-white/5 rounded-xl p-4">
                <p className="text-2xl font-bold text-retail-400">{count}</p>
                <p className="text-sm text-slate-300 capitalize">{type.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cohorts by Type */}
      {stats?.cohorts?.by_type && Object.keys(stats.cohorts.by_type).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <UserSquare2 className="w-5 h-5 text-orange-400" />
            Cohorts by Type
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.cohorts.by_type).map(([type, count]) => (
              <div key={type} className="bg-white/5 rounded-xl p-4">
                <p className="text-2xl font-bold text-orange-400">{count}</p>
                <p className="text-sm text-slate-300 capitalize">{type.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

