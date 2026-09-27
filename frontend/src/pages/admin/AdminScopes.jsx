import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Plus, 
  Trash2, 
  Edit2, 
  Users, 
  Tag, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  Check,
  X,
  Loader2
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';

export default function AdminScopes() {
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedScope, setExpandedScope] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEntitlementModal, setShowEntitlementModal] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  
  // Form state
  const [newScope, setNewScope] = useState({ name: '', description: '', is_admin: false });
  const [newEntitlement, setNewEntitlement] = useState({ tenant_type: 'category', tenant_id: '' });

  // Track if filters have been loaded (lazy load only when needed)
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    fetchScopes();
  }, []);

  const fetchScopes = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/scopes');
      setScopes(response.data.scopes);
    } catch (error) {
      console.error('Failed to fetch scopes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    if (filtersLoaded) return; // Already loaded
    try {
      const response = await api.get('/analytics/filters');
      setCategories(response.data.categories || []);
      setBrands(response.data.brands || []);
      setFiltersLoaded(true);
    } catch (error) {
      console.error('Failed to fetch filters:', error);
    }
  };
  
  // Open entitlement modal and load filters if needed
  const openEntitlementModal = (scopeId) => {
    setShowEntitlementModal(scopeId);
    fetchFilters(); // Load filters only when modal is opened
  };

  const createScope = async () => {
    try {
      await api.post('/admin/scopes', newScope);
      setShowCreateModal(false);
      setNewScope({ name: '', description: '', is_admin: false });
      fetchScopes();
    } catch (error) {
      console.error('Failed to create scope:', error);
      alert('Failed to create scope: ' + (extractErrorMessage(error)));
    }
  };

  const deleteScope = async (scopeId) => {
    if (!confirm('Are you sure you want to delete this scope?')) return;
    
    try {
      await api.delete(`/admin/scopes/${scopeId}`);
      fetchScopes();
    } catch (error) {
      console.error('Failed to delete scope:', error);
      alert('Failed to delete scope: ' + (extractErrorMessage(error)));
    }
  };

  const addEntitlement = async (scopeId) => {
    try {
      await api.post(`/admin/scopes/${scopeId}/entitlements`, newEntitlement);
      setShowEntitlementModal(null);
      setNewEntitlement({ tenant_type: 'category', tenant_id: '' });
      fetchScopes();
    } catch (error) {
      console.error('Failed to add entitlement:', error);
      alert('Failed to add entitlement: ' + (extractErrorMessage(error)));
    }
  };

  const deleteEntitlement = async (scopeId, entitlementId) => {
    try {
      await api.delete(`/admin/scopes/${scopeId}/entitlements/${entitlementId}`);
      fetchScopes();
    } catch (error) {
      console.error('Failed to delete entitlement:', error);
    }
  };

  const syncToSnowflake = async () => {
    setSyncing(true);
    try {
      const response = await api.post('/admin/scopes/sync-to-snowflake');
      alert(`Successfully synced ${response.data.entitlements_count} entitlements to Snowflake`);
    } catch (error) {
      console.error('Failed to sync:', error);
      alert('Failed to sync to Snowflake: ' + (extractErrorMessage(error)));
    } finally {
      setSyncing(false);
    }
  };

  const getEntitlementBadge = (entitlement) => {
    if (entitlement.tenant_type === 'all') {
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    } else if (entitlement.tenant_type === 'category') {
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    } else {
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    }
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2 flex items-center gap-3">
              <Shield className="w-8 h-8 text-amber-400" />
              Scope Management
            </h1>
            <p className="text-slate-400">
              Manage data access scopes and user permissions
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={syncToSnowflake}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync to Snowflake
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all"
            >
              <Plus className="w-4 h-4" />
              New Scope
            </button>
          </div>
        </div>
      </motion.div>

      {/* Scopes List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          </div>
        ) : scopes.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No scopes defined yet</div>
        ) : (
          scopes.map((scope, index) => (
            <motion.div
              key={scope.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="glass-card rounded-2xl overflow-hidden"
            >
              {/* Scope Header */}
              <div
                className="p-6 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpandedScope(expandedScope === scope.id ? null : scope.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      scope.is_admin ? 'bg-amber-500/20' : 'bg-blue-500/20'
                    }`}>
                      <Shield className={`w-6 h-6 ${scope.is_admin ? 'text-amber-400' : 'text-blue-400'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{scope.name}</h3>
                        {scope.is_admin && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{scope.description || 'No description'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{scope.user_count}</p>
                      <p className="text-xs text-slate-400">Users</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{scope.entitlements.length}</p>
                      <p className="text-xs text-slate-400">Entitlements</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScope(scope.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expandedScope === scope.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Expanded Content */}
              {expandedScope === scope.id && (
                <div className="px-6 pb-6 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-slate-300">Entitlements</h4>
                    <button
                      onClick={() => openEntitlementModal(scope.id)}
                      className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300"
                    >
                      <Plus className="w-4 h-4" />
                      Add Entitlement
                    </button>
                  </div>
                  
                  {scope.entitlements.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No entitlements defined - users with this scope will have no data access</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {scope.entitlements.map((ent) => (
                        <div
                          key={ent.id}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getEntitlementBadge(ent)}`}
                        >
                          <Tag className="w-3 h-3" />
                          <span className="text-sm font-medium">
                            {ent.tenant_type === 'all' 
                              ? 'Full Access' 
                              : `${ent.tenant_type}: ${ent.tenant_id}`}
                          </span>
                          <button
                            onClick={() => deleteEntitlement(scope.id, ent.id)}
                            className="p-0.5 hover:bg-white/10 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Create Scope Modal */}
      {showCreateModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Scope</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newScope.name}
                  onChange={(e) => setNewScope({ ...newScope, name: e.target.value })}
                  placeholder="e.g., Dairy Category Manager"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={newScope.description}
                  onChange={(e) => setNewScope({ ...newScope, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={newScope.is_admin}
                  onChange={(e) => setNewScope({ ...newScope, is_admin: e.target.checked })}
                  className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="is_admin" className="text-sm text-slate-300">
                  Admin scope (bypasses all row filtering)
                </label>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createScope}
                disabled={!newScope.name}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50"
              >
                Create Scope
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Entitlement Modal */}
      {showEntitlementModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setShowEntitlementModal(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Add Entitlement</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Access Type</label>
                <select
                  value={newEntitlement.tenant_type}
                  onChange={(e) => setNewEntitlement({ 
                    tenant_type: e.target.value, 
                    tenant_id: e.target.value === 'all' ? null : '' 
                  })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Full Access (All Data)</option>
                  <option value="category">Category</option>
                  <option value="brand">Brand</option>
                </select>
              </div>
              
              {newEntitlement.tenant_type !== 'all' && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    {newEntitlement.tenant_type === 'category' ? 'Category' : 'Brand'}
                  </label>
                  <select
                    value={newEntitlement.tenant_id}
                    onChange={(e) => setNewEntitlement({ ...newEntitlement, tenant_id: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select...</option>
                    {(newEntitlement.tenant_type === 'category' ? categories : brands).map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEntitlementModal(null)}
                className="px-4 py-2 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => addEntitlement(showEntitlementModal)}
                disabled={newEntitlement.tenant_type !== 'all' && !newEntitlement.tenant_id}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50"
              >
                Add Entitlement
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

