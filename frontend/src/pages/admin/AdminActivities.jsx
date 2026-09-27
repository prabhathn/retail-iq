import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Filter, Eye, MousePointer, LogIn, FileText, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import api from '../../services/api';

const actionIcons = {
  page_view: Eye,
  button_click: MousePointer,
  report_run: FileText,
  login: LogIn,
  logout: LogIn
};

const actionColors = {
  page_view: 'blue',
  button_click: 'purple',
  report_run: 'green',
  login: 'amber',
  logout: 'red'
};

const PAGE_SIZE = 200;

export default function AdminActivities() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  
  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [filterType, filterUser, page]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users?limit=1000');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('action_type', filterType);
      if (filterUser) params.append('user_id', filterUser);
      params.append('skip', (page * PAGE_SIZE).toString());
      params.append('limit', PAGE_SIZE.toString());
      
      const response = await api.get(`/admin/activities?${params.toString()}`);
      setActivities(response.data.activities);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterUser('');
    setPage(0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const actionTypes = ['page_view', 'button_click', 'report_run', 'login', 'logout'];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasActiveFilters = filterType || filterUser;

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <Activity className="w-8 h-8 text-purple-400" />
          <h1 className="text-2xl font-display font-bold text-white">Activity</h1>
        </div>
        <p className="text-slate-400">{total.toLocaleString()} total activities</p>
      </motion.div>

      {/* Filters Bar */}
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          {/* User Filter */}
          <div className="flex-1 min-w-[200px] max-w-[250px]">
            <select
              value={filterUser}
              onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.full_name} ({user.email})</option>
              ))}
            </select>
          </div>
          
          {/* Action Type Filter */}
          <div className="flex-1 min-w-[150px] max-w-[200px]">
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Actions</option>
              {actionTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          
          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
          
          {/* Results count */}
          <div className="ml-auto text-sm text-slate-400">
            Showing {activities.length} of {total.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Compact Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Time</th>
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">User</th>
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Action</th>
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">Detail</th>
              <th className="text-left text-xs font-medium text-slate-400 px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {activities.map((activity) => {
              const Icon = actionIcons[activity.action_type] || Activity;
              const color = actionColors[activity.action_type] || 'slate';
              
              return (
                <tr key={activity.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2 text-xs text-slate-400 whitespace-nowrap">
                    {formatDate(activity.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                        {activity.user_name?.charAt(0) || '?'}
                      </div>
                      <span className="text-sm text-white truncate max-w-[120px]" title={activity.user_email}>
                        {activity.user_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-${color}-500/20 text-${color}-300`}>
                      <Icon className="w-3 h-3" />
                      {activity.action_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-300 truncate max-w-[250px]" title={activity.action_detail}>
                    {activity.action_detail || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 font-mono">
                    {activity.ip_address || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {activities.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400">
            No activities found
          </div>
        )}
        
        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Page {page + 1} of {totalPages}
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i;
                } else if (page < 3) {
                  pageNum = i;
                } else if (page > totalPages - 4) {
                  pageNum = totalPages - 5 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                      page === pageNum
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
