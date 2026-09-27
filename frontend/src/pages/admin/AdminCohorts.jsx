import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { UserSquare2, Search, Filter, ChevronLeft, ChevronRight, Eye, Users, Layers, Loader2 } from 'lucide-react';
import api from '../../services/api';

export default function AdminCohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    cohort_type: '',
    user_id: ''
  });
  const [users, setUsers] = useState([]);
  const [selectedCohort, setSelectedCohort] = useState(null);

  useEffect(() => {
    fetchCohorts();
    fetchUsers();
  }, [page, filters]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users?limit=100');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchCohorts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        skip: page * limit,
        limit: limit,
        ...(filters.cohort_type && { cohort_type: filters.cohort_type }),
        ...(filters.user_id && { user_id: filters.user_id })
      });
      const response = await api.get(`/admin/cohorts?${params}`);
      setCohorts(response.data.cohorts);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch cohorts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  const getCohortTypeBadge = (type) => {
    const styles = {
      custom: 'bg-purple-500/20 text-purple-300',
      segment: 'bg-cyan-500/20 text-cyan-300'
    };
    return styles[type] || 'bg-gray-500/20 text-gray-300';
  };

  const formatDefinition = (definition) => {
    if (!definition) return '-';
    
    if (definition.conditions) {
      // Custom cohort
      return definition.conditions.map(c => 
        `${c.field}: ${c.value} (${c.operator}, ${c.days} days)`
      ).join('; ');
    } else if (definition.segment_type) {
      // Segment cohort
      return `${definition.segment_type}: ${definition.segment_name}`;
    }
    return JSON.stringify(definition);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-display font-bold text-white mb-2 flex items-center gap-3">
          <UserSquare2 className="w-8 h-8 text-orange-400" />
          Cohorts
        </h1>
        <p className="text-slate-400">
          View and manage all user-created shopper cohorts
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-6 mb-6"
      >
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm">Filters:</span>
          </div>
          
          <select
            value={filters.cohort_type}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, cohort_type: e.target.value }));
              setPage(0);
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Types</option>
            <option value="custom">Custom</option>
            <option value="segment">Segment</option>
          </select>
          
          <select
            value={filters.user_id}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, user_id: e.target.value }));
              setPage(0);
            }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Users</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.full_name} ({user.email})</option>
            ))}
          </select>

          {(filters.cohort_type || filters.user_id) && (
            <button
              onClick={() => {
                setFilters({ cohort_type: '', user_id: '' });
                setPage(0);
              }}
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </motion.div>

      {/* Cohorts Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-sm font-medium text-slate-400 p-4">Name</th>
                <th className="text-left text-sm font-medium text-slate-400 p-4">Type</th>
                <th className="text-left text-sm font-medium text-slate-400 p-4">User</th>
                <th className="text-right text-sm font-medium text-slate-400 p-4">Shoppers</th>
                <th className="text-left text-sm font-medium text-slate-400 p-4">Definition</th>
                <th className="text-left text-sm font-medium text-slate-400 p-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
                    </div>
                  </td>
                </tr>
              ) : cohorts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No cohorts found
                  </td>
                </tr>
              ) : (
                cohorts.map((cohort, i) => (
                  <tr 
                    key={cohort.id} 
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div>
                        <p className="text-white font-medium">{cohort.name}</p>
                        {cohort.description && (
                          <p className="text-sm text-slate-400 truncate max-w-xs">{cohort.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCohortTypeBadge(cohort.cohort_type)}`}>
                        {cohort.cohort_type}
                      </span>
                    </td>
                    <td className="p-4">
                      <div>
                        <p className="text-white text-sm">{cohort.user_name}</p>
                        <p className="text-xs text-slate-400">{cohort.user_email}</p>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-orange-400 font-bold">
                          {cohort.shopper_count?.toLocaleString() || 0}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-slate-300 truncate max-w-xs">
                        {formatDefinition(cohort.definition)}
                      </p>
                    </td>
                    <td className="p-4 text-slate-400 text-sm">
                      {formatDate(cohort.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <p className="text-sm text-slate-400">
              Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total} cohorts
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-slate-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

