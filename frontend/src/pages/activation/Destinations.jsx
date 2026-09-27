import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Share2, Plus, Settings, Trash2, Check, X, Loader2,
  ExternalLink, RefreshCw, AlertCircle, ChevronDown, 
  ChevronRight, Eye, EyeOff, Shield, Zap
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { trackObjectCreate, trackObjectModify, trackObjectDelete, OBJECT_TYPES } from '../../services/tracking';

// Network icon mapping (using emojis from backend)
const NETWORK_ICONS = {
  facebook: '📘',
  trade_desk: '📊',
  google_display: '🌐',
  amazon_dsp: '📦',
  criteo: '🎯',
  liveramp: '🔗',
  grocery_tv: '📺',
  vusion_group: '🏷️',
};

const NETWORK_COLORS = {
  facebook: 'from-blue-600 to-blue-400',
  trade_desk: 'from-green-600 to-green-400',
  google_display: 'from-amber-500 to-yellow-400',
  amazon_dsp: 'from-orange-600 to-orange-400',
  criteo: 'from-purple-600 to-purple-400',
  liveramp: 'from-teal-600 to-teal-400',
  grocery_tv: 'from-rose-600 to-pink-400',
  vusion_group: 'from-indigo-600 to-violet-400',
};

const CATEGORY_LABELS = {
  digital: { label: 'Digital Ad Networks', icon: '🌐' },
  instore: { label: 'In-Store Networks', icon: '🏪' },
};

export default function Destinations() {
  // View state
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit'
  const [destinations, setDestinations] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [editingId, setEditingId] = useState(null);
  
  // Form state
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    credentials: {},
  });
  const [showPasswords, setShowPasswords] = useState({});
  const [errors, setErrors] = useState({});

  // Load destinations and networks
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [destRes, netRes] = await Promise.all([
        api.get('/destinations'),
        api.get('/destinations/networks'),
      ]);
      setDestinations(destRes.data.destinations || []);
      setNetworks(netRes.data.networks || []);
    } catch (error) {
      console.error('Failed to load destinations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedNetwork(null);
    setFormData({ name: '', description: '', credentials: {} });
    setShowPasswords({});
    setErrors({});
    setEditingId(null);
    setView('create');
  };

  const handleEdit = (destination) => {
    const network = networks.find(n => n.id === destination.network_id);
    setSelectedNetwork(network);
    setFormData({
      name: destination.name,
      description: destination.description || '',
      credentials: {}, // Don't pre-fill credentials for security
    });
    setShowPasswords({});
    setErrors({});
    setEditingId(destination.id);
    setView('edit');
  };

  const handleSelectNetwork = (network) => {
    setSelectedNetwork(network);
    // Initialize credentials object with empty strings
    const initialCreds = {};
    network.credentials.forEach(c => {
      initialCreds[c.key] = '';
    });
    setFormData(prev => ({
      ...prev,
      name: prev.name || 'My Account',
      credentials: initialCreds,
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    // Check if destination is being created (not edited)
    const isEditing = editingId !== null;
    
    if (!isEditing && selectedNetwork) {
      selectedNetwork.credentials.forEach(cred => {
        if (cred.required && !formData.credentials[cred.key]?.trim()) {
          newErrors[cred.key] = `${cred.label} is required`;
        }
      });
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    try {
      setSaving(true);
      
      const payload = {
        network_id: selectedNetwork.id,
        name: formData.name,
        description: formData.description || null,
        credentials: formData.credentials,
      };
      
      if (editingId) {
        // Filter out empty credentials for update
        const nonEmptyCreds = {};
        Object.entries(formData.credentials).forEach(([k, v]) => {
          if (v.trim()) nonEmptyCreds[k] = v;
        });
        
        await api.put(`/destinations/${editingId}`, {
          name: formData.name,
          description: formData.description || null,
          credentials: Object.keys(nonEmptyCreds).length > 0 ? nonEmptyCreds : undefined,
        });
        trackObjectModify(OBJECT_TYPES.DESTINATION, editingId, formData.name, ['name', 'credentials'], {
          network_id: selectedNetwork?.id
        });
      } else {
        const response = await api.post('/destinations', payload);
        trackObjectCreate(OBJECT_TYPES.DESTINATION, response.data?.id, formData.name, {
          network_id: selectedNetwork?.id,
          network_name: selectedNetwork?.name
        });
      }
      
      await loadData();
      setView('list');
    } catch (error) {
      console.error('Failed to save destination:', error);
      setErrors({ submit: extractErrorMessage(error, 'Failed to save destination') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this destination?')) return;
    
    try {
      const dest = destinations.find(d => d.id === id);
      await api.delete(`/destinations/${id}`);
      trackObjectDelete(OBJECT_TYPES.DESTINATION, id, dest?.name);
      await loadData();
    } catch (error) {
      console.error('Failed to delete destination:', error);
    }
  };

  const handleVerify = async (id) => {
    try {
      setVerifying(id);
      const response = await api.post(`/destinations/${id}/verify`);
      
      if (response.data.status === 'success') {
        // Reload to get updated verification status
        await loadData();
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      console.error('Failed to verify destination:', error);
      alert('Verification failed. Please try again.');
    } finally {
      setVerifying(null);
    }
  };

  const handleToggleActive = async (destination) => {
    try {
      await api.put(`/destinations/${destination.id}`, {
        is_active: !destination.is_active,
      });
      await loadData();
    } catch (error) {
      console.error('Failed to toggle destination:', error);
    }
  };

  // Group destinations by network
  const groupedDestinations = destinations.reduce((acc, dest) => {
    if (!acc[dest.network_id]) acc[dest.network_id] = [];
    acc[dest.network_id].push(dest);
    return acc;
  }, {});

  return (
    <div className="p-8 h-full overflow-y-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Destinations
            </h1>
            <p className="text-slate-400">
              Connect your ad network accounts to activate audiences
            </p>
          </div>
        </div>
        
        {view === 'list' && (
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg shadow-cyan-500/25"
          >
            <Plus className="w-5 h-5" />
            Add Destination
          </button>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : destinations.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                  <Share2 className="w-8 h-8 text-cyan-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  No Destinations Configured
                </h3>
                <p className="text-slate-400 max-w-md mx-auto mb-6">
                  Connect your ad network accounts to start activating your shopper cohorts
                  across Facebook, Google, The Trade Desk, and more.
                </p>
                <button
                  onClick={handleCreateNew}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Destination
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-sm text-slate-400">Total Destinations</div>
                    <div className="text-2xl font-bold text-white">{destinations.length}</div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-sm text-slate-400">Active</div>
                    <div className="text-2xl font-bold text-green-400">
                      {destinations.filter(d => d.is_active).length}
                    </div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-sm text-slate-400">Verified</div>
                    <div className="text-2xl font-bold text-cyan-400">
                      {destinations.filter(d => d.is_verified).length}
                    </div>
                  </div>
                  <div className="glass-card rounded-xl p-4">
                    <div className="text-sm text-slate-400">Networks Connected</div>
                    <div className="text-2xl font-bold text-purple-400">
                      {Object.keys(groupedDestinations).length}
                    </div>
                  </div>
                </div>

                {/* Destinations List by Network */}
                {Object.entries(groupedDestinations).map(([networkId, networkDests]) => (
                  <div key={networkId} className="glass-card rounded-2xl overflow-hidden">
                    <div className={`px-6 py-4 bg-gradient-to-r ${NETWORK_COLORS[networkId] || 'from-slate-600 to-slate-500'} flex items-center gap-3`}>
                      <span className="text-2xl">{NETWORK_ICONS[networkId] || '📡'}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {networkDests[0]?.network_name || networkId}
                        </h3>
                        <p className="text-sm text-white/70">
                          {networkDests.length} account{networkDests.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    
                    <div className="divide-y divide-white/5">
                      {networkDests.map(dest => (
                        <div key={dest.id} className="p-6 hover:bg-white/5 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h4 className="text-lg font-medium text-white">{dest.name}</h4>
                                <div className="flex items-center gap-2">
                                  {dest.is_verified ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                                      <Shield className="w-3 h-3" />
                                      Verified
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                                      <AlertCircle className="w-3 h-3" />
                                      Unverified
                                    </span>
                                  )}
                                  {!dest.is_active && (
                                    <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded-full">
                                      Inactive
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {dest.description && (
                                <p className="text-sm text-slate-400 mt-1">{dest.description}</p>
                              )}
                              
                              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                                <span>
                                  Credentials: {dest.credentials_configured.join(', ')}
                                </span>
                                {dest.last_synced && (
                                  <span>
                                    Last synced: {new Date(dest.last_synced).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleVerify(dest.id)}
                                disabled={verifying === dest.id}
                                className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors disabled:opacity-50"
                                title="Test Connection"
                              >
                                {verifying === dest.id ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-5 h-5" />
                                )}
                              </button>
                              
                              <button
                                onClick={() => handleToggleActive(dest)}
                                className={`p-2 rounded-lg transition-colors ${
                                  dest.is_active 
                                    ? 'text-green-400 hover:bg-green-500/10' 
                                    : 'text-slate-400 hover:bg-slate-500/10'
                                }`}
                                title={dest.is_active ? 'Deactivate' : 'Activate'}
                              >
                                <Zap className="w-5 h-5" />
                              </button>
                              
                              <button
                                onClick={() => handleEdit(dest)}
                                className="p-2 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Settings className="w-5 h-5" />
                              </button>
                              
                              <button
                                onClick={() => handleDelete(dest.id)}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="glass-card rounded-2xl p-8">
              {/* Back button */}
              <button
                onClick={() => setView('list')}
                className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back to Destinations
              </button>

              <h2 className="text-2xl font-bold text-white mb-6">
                {editingId ? 'Edit Destination' : 'Add New Destination'}
              </h2>

              {/* Network Selection (only for new) */}
              {!editingId && !selectedNetwork && (
                <div className="space-y-8">
                  {/* Digital Ad Networks */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-slate-300 flex items-center gap-2">
                      <span>{CATEGORY_LABELS.digital?.icon}</span>
                      {CATEGORY_LABELS.digital?.label}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {networks.filter(n => n.category === 'digital' || !n.category).map(network => (
                        <button
                          key={network.id}
                          onClick={() => handleSelectNetwork(network)}
                          className={`p-6 rounded-xl border transition-all text-left hover:scale-[1.02] ${
                            selectedNetwork?.id === network.id
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <span className="text-3xl mb-3 block">{network.icon}</span>
                          <h4 className="text-lg font-medium text-white">{network.name}</h4>
                          <p className="text-sm text-slate-400 mt-1">
                            {network.credentials.filter(c => c.required).length} required fields
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* In-Store Networks */}
                  {networks.some(n => n.category === 'instore') && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium text-slate-300 flex items-center gap-2">
                        <span>{CATEGORY_LABELS.instore?.icon}</span>
                        {CATEGORY_LABELS.instore?.label}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {networks.filter(n => n.category === 'instore').map(network => (
                          <button
                            key={network.id}
                            onClick={() => handleSelectNetwork(network)}
                            className={`p-6 rounded-xl border transition-all text-left hover:scale-[1.02] ${
                              selectedNetwork?.id === network.id
                                ? 'border-cyan-500 bg-cyan-500/10'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <span className="text-3xl mb-3 block">{network.icon}</span>
                            <h4 className="text-lg font-medium text-white">{network.name}</h4>
                            <p className="text-sm text-slate-400 mt-1">
                              {network.credentials.filter(c => c.required).length} required fields
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Credential Form */}
              {selectedNetwork && (
                <div className="space-y-6">
                  {/* Selected Network Header */}
                  <div className={`flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${NETWORK_COLORS[selectedNetwork.id] || 'from-slate-600 to-slate-500'}`}>
                    <span className="text-3xl">{selectedNetwork.icon}</span>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{selectedNetwork.name}</h3>
                      <p className="text-sm text-white/70">
                        Enter your account credentials below
                      </p>
                    </div>
                    {!editingId && (
                      <button
                        onClick={() => setSelectedNetwork(null)}
                        className="ml-auto p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* Name & Description */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Destination Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., My Facebook Ads Account"
                        className={`w-full bg-slate-800 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          errors.name ? 'border-red-500' : 'border-white/10'
                        }`}
                      />
                      {errors.name && (
                        <p className="text-red-400 text-sm mt-1">{errors.name}</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="e.g., Production account for brand campaigns"
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>

                  {/* Credentials */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-medium text-slate-300 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-cyan-400" />
                      Credentials
                      {editingId && (
                        <span className="text-sm text-slate-500 font-normal">
                          (leave blank to keep existing)
                        </span>
                      )}
                    </h4>
                    
                    {selectedNetwork.credentials.map(cred => (
                      <div key={cred.key}>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          {cred.label} {cred.required && !editingId && <span className="text-red-400">*</span>}
                        </label>
                        <div className="relative">
                          <input
                            type={cred.type === 'password' && !showPasswords[cred.key] ? 'password' : 'text'}
                            value={formData.credentials[cred.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              credentials: { ...prev.credentials, [cred.key]: e.target.value }
                            }))}
                            placeholder={cred.placeholder}
                            className={`w-full bg-slate-800 border rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                              errors[cred.key] ? 'border-red-500' : 'border-white/10'
                            }`}
                          />
                          {cred.type === 'password' && (
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [cred.key]: !prev[cred.key] }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                              {showPasswords[cred.key] ? (
                                <EyeOff className="w-5 h-5" />
                              ) : (
                                <Eye className="w-5 h-5" />
                              )}
                            </button>
                          )}
                        </div>
                        {errors[cred.key] && (
                          <p className="text-red-400 text-sm mt-1">{errors[cred.key]}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Error Message */}
                  {errors.submit && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                      {errors.submit}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-4 pt-4 border-t border-white/10">
                    <button
                      onClick={() => setView('list')}
                      className="px-6 py-3 border border-white/10 text-slate-300 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          {editingId ? 'Update Destination' : 'Save Destination'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

