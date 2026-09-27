import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutGrid, Eye, EyeOff, Loader2, RefreshCw, AlertCircle, Check, X,
  Database, ChevronDown, ChevronRight, Search, Filter, Power, PowerOff,
  Info, AlertTriangle
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { trackPageView } from '../../services/tracking';
import { useAuth } from '../../contexts/AuthContext';

// Predefined disabled reasons
const DISABLED_REASONS = [
  { value: 'under_maintenance', label: 'Under Maintenance' },
  { value: 'dataset_not_connected', label: 'Dataset Not Connected' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'custom', label: 'Custom Reason...' },
];

export default function AdminModules() {
  const { refreshModuleAccess } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // module_key being saved
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data
  const [modules, setModules] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSection, setFilterSection] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState({});
  
  // Disable modal
  const [disableModal, setDisableModal] = useState(null);
  const [disableReason, setDisableReason] = useState('under_maintenance');
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    trackPageView('/admin/modules', 'Admin Modules');
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modulesRes, datasetsRes] = await Promise.all([
        api.get('/admin/modules'),
        api.get('/admin/datasets'),
      ]);
      setModules(modulesRes.data.modules || []);
      setDatasets(datasetsRes.data.datasets || []);
    } catch (err) {
      console.error('Failed to load module data:', err);
      setError('Failed to load module configuration');
    } finally {
      setLoading(false);
    }
  };

  // Clear messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleEnableModule = async (moduleKey) => {
    setSaving(moduleKey);
    try {
      await api.put(`/admin/modules/settings/${moduleKey}`, {
        is_enabled: true,
        disabled_reason: null,
      });
      setSuccess(`Module "${moduleKey}" enabled`);
      loadData();
      refreshModuleAccess();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to enable module'));
    } finally {
      setSaving(null);
    }
  };

  const handleDisableModule = async () => {
    if (!disableModal) return;
    
    const reason = disableReason === 'custom' 
      ? customReason 
      : DISABLED_REASONS.find(r => r.value === disableReason)?.label;
    
    setSaving(disableModal);
    try {
      await api.put(`/admin/modules/settings/${disableModal}`, {
        is_enabled: false,
        disabled_reason: reason || 'Disabled by admin',
      });
      setSuccess(`Module "${disableModal}" disabled`);
      setDisableModal(null);
      setDisableReason('under_maintenance');
      setCustomReason('');
      loadData();
      refreshModuleAccess();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to disable module'));
    } finally {
      setSaving(null);
    }
  };

  const handleDisableByDataset = async (datasetKey, datasetLabel) => {
    if (!confirm(`Disable all modules that require "${datasetLabel}"? This will affect multiple modules.`)) {
      return;
    }
    
    setSaving(datasetKey);
    try {
      const res = await api.post(`/admin/modules/disable-by-dataset/${datasetKey}`);
      setSuccess(`Disabled ${res.data.affected_modules.length} modules`);
      loadData();
      refreshModuleAccess();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to disable modules'));
    } finally {
      setSaving(null);
    }
  };

  const handleEnableByDataset = async (datasetKey, datasetLabel) => {
    setSaving(datasetKey);
    try {
      const res = await api.post(`/admin/modules/enable-by-dataset/${datasetKey}`);
      setSuccess(`Re-enabled ${res.data.enabled_modules.length} modules`);
      loadData();
      refreshModuleAccess();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to enable modules'));
    } finally {
      setSaving(null);
    }
  };

  // Group modules by section
  const groupedModules = modules.reduce((acc, module) => {
    const section = module.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(module);
    return acc;
  }, {});

  // Get unique sections
  const sections = ['all', ...Object.keys(groupedModules)];

  // Filter modules
  const filteredModules = modules.filter(module => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!module.label.toLowerCase().includes(query) && 
          !module.key.toLowerCase().includes(query) &&
          !module.description?.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Section filter
    if (filterSection !== 'all') {
      const moduleSection = module.section || 'General';
      if (moduleSection !== filterSection) return false;
    }
    
    // Status filter
    if (filterStatus === 'enabled' && !module.global_settings.is_enabled) return false;
    if (filterStatus === 'disabled' && module.global_settings.is_enabled) return false;
    
    return true;
  });

  // Group filtered modules
  const filteredGrouped = filteredModules.reduce((acc, module) => {
    const section = module.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(module);
    return acc;
  }, {});

  // Stats
  const enabledCount = modules.filter(m => m.global_settings.is_enabled).length;
  const disabledCount = modules.filter(m => !m.global_settings.is_enabled).length;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl">
            <LayoutGrid className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Active Modules</h1>
            <p className="text-slate-400">Enable or disable modules globally for all users</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-300"
          >
            <Check className="w-5 h-5" />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Total Modules</div>
          <div className="text-2xl font-bold text-white">{modules.length}</div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Enabled</div>
          <div className="text-2xl font-bold text-green-400">{enabledCount}</div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Disabled</div>
          <div className="text-2xl font-bold text-red-400">{disabledCount}</div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Datasets</div>
          <div className="text-2xl font-bold text-blue-400">{datasets.length}</div>
        </div>
      </div>

      {/* Datasets Section */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Dataset Dependencies
          </h2>
          <span className="text-xs text-slate-500">
            Quickly disable/enable modules by dataset availability
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {datasets.map(dataset => {
            // Modules disabled specifically due to THIS dataset
            const expectedReason = `Dataset '${dataset.label}' not connected`;
            const disconnectedModules = modules.filter(
              m => m.requires_datasets?.includes(dataset.key) && 
                   !m.global_settings.is_enabled &&
                   m.global_settings.disabled_reason === expectedReason
            );
            const isDisconnected = disconnectedModules.length > 0;
            
            // Modules that require this dataset but are disabled for OTHER reasons
            const affectedByOtherReasons = modules.filter(
              m => m.requires_datasets?.includes(dataset.key) && 
                   !m.global_settings.is_enabled &&
                   m.global_settings.disabled_reason !== expectedReason
            );
            const hasAffectedModules = affectedByOtherReasons.length > 0;
            
            return (
              <div
                key={dataset.key}
                className={`p-4 rounded-lg border ${
                  isDisconnected 
                    ? 'bg-red-900/20 border-red-500/30' 
                    : 'bg-slate-800/50 border-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-white font-medium flex items-center gap-2">
                      {dataset.label}
                      {isDisconnected && (
                        <span className="px-1.5 py-0.5 bg-red-500/30 text-red-400 text-xs rounded">
                          Disconnected
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{dataset.key}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                    {dataset.dependent_module_count} modules
                  </span>
                </div>
                <p className="text-sm text-slate-400 mb-3">{dataset.description}</p>
                
                {/* Warning for modules affected by other disconnections */}
                {hasAffectedModules && !isDisconnected && (
                  <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>
                      {affectedByOtherReasons.length} module{affectedByOtherReasons.length > 1 ? 's' : ''} requiring this dataset {affectedByOtherReasons.length > 1 ? 'are' : 'is'} disabled due to other datasets
                    </span>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {isDisconnected ? (
                    <button
                      onClick={() => handleEnableByDataset(dataset.key, dataset.label)}
                      disabled={saving === dataset.key}
                      className="flex-1 px-3 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors flex items-center justify-center gap-1"
                    >
                      {saving === dataset.key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Power className="w-3 h-3" />
                      )}
                      Reconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDisableByDataset(dataset.key, dataset.label)}
                      disabled={saving === dataset.key}
                      className="flex-1 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors flex items-center justify-center gap-1"
                    >
                      {saving === dataset.key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <PowerOff className="w-3 h-3" />
                      )}
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none"
        >
          {sections.map(section => (
            <option key={section} value={section}>
              {section === 'all' ? 'All Sections' : section}
            </option>
          ))}
        </select>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="enabled">Enabled Only</option>
          <option value="disabled">Disabled Only</option>
        </select>
      </div>

      {/* Modules List */}
      <div className="space-y-4">
        {Object.entries(filteredGrouped).map(([section, sectionModules]) => {
          const isExpanded = expandedSections[section] !== false; // Default to expanded
          const disabledInSection = sectionModules.filter(m => !m.global_settings.is_enabled).length;
          
          return (
            <div key={section} className="glass-card rounded-xl overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section)}
                className="w-full px-6 py-4 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-white font-semibold">{section}</span>
                  <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
                    {sectionModules.length} modules
                  </span>
                  {disabledInSection > 0 && (
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                      {disabledInSection} disabled
                    </span>
                  )}
                </div>
              </button>
              
              {/* Section Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-slate-700/50">
                      {sectionModules.map(module => {
                        const isEnabled = module.global_settings.is_enabled;
                        const isSaving = saving === module.key;
                        
                        return (
                          <div
                            key={module.key}
                            className={`px-6 py-4 flex items-center justify-between ${
                              !isEnabled ? 'bg-slate-900/50 opacity-75' : ''
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isEnabled ? 'text-white' : 'text-slate-400'}`}>
                                  {module.label}
                                </span>
                                {!isEnabled && (
                                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded flex items-center gap-1">
                                    <EyeOff className="w-3 h-3" />
                                    Disabled
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-slate-500 mt-0.5">
                                {module.key}
                              </div>
                              {module.description && (
                                <div className="text-sm text-slate-400 mt-1">
                                  {module.description}
                                </div>
                              )}
                              {!isEnabled && module.global_settings.disabled_reason && (
                                <div className="mt-2 text-sm text-amber-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  {module.global_settings.disabled_reason}
                                </div>
                              )}
                              {module.requires_datasets?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {module.requires_datasets.map(ds => (
                                    <span
                                      key={ds}
                                      className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded"
                                    >
                                      {ds}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 ml-4">
                              {isEnabled ? (
                                <button
                                  onClick={() => setDisableModal(module.key)}
                                  disabled={isSaving}
                                  className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center gap-2 text-sm"
                                >
                                  {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                  Disable
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleEnableModule(module.key)}
                                  disabled={isSaving}
                                  className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-2 text-sm"
                                >
                                  {isSaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                  Enable
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Info Note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/50 border border-white/5">
        <Info className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-slate-400">
          <span className="text-slate-300 font-medium">Note:</span> Disabling a module globally hides it from 
          all users regardless of their individual permissions. User permissions are preserved and will 
          apply again when the module is re-enabled.
        </div>
      </div>

      {/* Disable Modal */}
      <AnimatePresence>
        {disableModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setDisableModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 rounded-xl border border-white/10 shadow-xl p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-2">
                Disable Module
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                This will hide <span className="text-white">{disableModal}</span> from all users.
                Please select a reason:
              </p>
              
              <div className="space-y-3 mb-6">
                {DISABLED_REASONS.map(reason => (
                  <label
                    key={reason.value}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="disableReason"
                      value={reason.value}
                      checked={disableReason === reason.value}
                      onChange={(e) => setDisableReason(e.target.value)}
                      className="w-4 h-4 text-cyan-500"
                    />
                    <span className={disableReason === reason.value ? 'text-white' : 'text-slate-400'}>
                      {reason.label}
                    </span>
                  </label>
                ))}
                
                {disableReason === 'custom' && (
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter custom reason..."
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                    autoFocus
                  />
                )}
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDisableModal(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisableModule}
                  disabled={saving || (disableReason === 'custom' && !customReason.trim())}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                  Disable Module
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
