import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, Settings, Play, Pause, Loader2, ExternalLink, Plus, X,
  Package, RefreshCw, TrendingDown, AlertCircle, Megaphone, Clock,
  Link2, ChevronRight, Sparkles, FileText, Check, Tag, Users, Building, Cloud
} from 'lucide-react';
import api from '../services/api';
import AutomationBuilder from '../components/AutomationBuilder';
import { AUTOMATION_TEMPLATES, generateId } from '../config/automationSchema';

// Automation type icons
const AUTOMATION_ICONS = {
  low_inventory: Package,
  inventory_substitution: RefreshCw,
  price_drop: TrendingDown,
  high_inventory_promo: Tag,
  replenishment_reminder: Users,
  staffing_fulfillment: Building,
  weather_sponsored: Cloud,
  slow_mover_alert: AlertCircle,
  custom: Zap,
  default: Zap,
};

// Source type icons and colors
const SOURCE_TYPES = {
  campaign: {
    label: 'Campaign',
    icon: Megaphone,
    color: 'from-purple-500 to-pink-500',
  },
  standalone: {
    label: 'Standalone',
    icon: Zap,
    color: 'from-amber-500 to-orange-500',
  },
};

// Dataset display names
const DATASET_LABELS = {
  products: 'Products',
  inventory: 'Inventory',
  shoppers: 'Shoppers',
  transactions: 'Transactions',
  stores: 'Stores',
  labor: 'Labor',
  weather: 'Weather',
  demand_forecast: 'Demand',
};

export default function Automations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  
  // Create/Edit modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState('template'); // 'template' | 'builder'
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  
  // New automation form state
  const [newAutomation, setNewAutomation] = useState({
    name: '',
    description: '',
    conditions: [{ id: generateId('cond'), object: 'product', metric: 'days_on_hand', operator: 'greater_than', value: 50, value_type: 'percentage' }],
    condition_logic: 'AND',
    actions: [{ id: generateId('act'), object: 'promotion', action: 'create', parameters: {} }],
    scope: null,
  });

  useEffect(() => {
    loadAutomations();
    
    // Check if we should open edit modal from URL
    const editId = searchParams.get('edit');
    if (editId) {
      loadAutomationForEdit(parseInt(editId));
    }
  }, []);

  const loadAutomations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/automations');
      setAutomations(response.data.automations || []);
    } catch (err) {
      console.error('Failed to load automations:', err);
      setError('Failed to load automations');
    } finally {
      setLoading(false);
    }
  };

  const loadAutomationForEdit = async (id) => {
    try {
      const response = await api.get(`/automations/standalone/${id}`);
      const data = response.data;
      
      setEditingAutomation(data);
      setNewAutomation({
        name: data.name || '',
        description: data.description || '',
        conditions: data.conditions || [{ id: generateId('cond'), object: 'product', metric: 'days_on_hand', operator: 'greater_than', value: 50, value_type: 'percentage' }],
        condition_logic: data.condition_logic || 'AND',
        actions: data.actions || [{ id: generateId('act'), object: 'promotion', action: 'create', parameters: {} }],
        scope: data.scope || null,
      });
      setCreateStep('builder');
      setShowCreateModal(true);
    } catch (err) {
      console.error('Failed to load automation for edit:', err);
    }
  };

  const handleToggleStatus = async (automation) => {
    const newBackendStatus = automation.status === 'running' ? 'paused' : 'active';
    const newDisplayStatus = newBackendStatus === 'active' ? 'running' : 'paused';
    
    try {
      setTogglingId(automation.id);
      await api.patch(`/automations/${automation.id}/status`, { status: newBackendStatus });
      
      setAutomations(prev => prev.map(a => 
        a.id === automation.id ? { ...a, status: newDisplayStatus } : a
      ));
    } catch (err) {
      console.error('Failed to toggle automation:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenSettings = (automation) => {
    navigate(automation.source_path);
  };

  const handleOpenCreate = () => {
    setEditingAutomation(null);
    setNewAutomation({
      name: '',
      description: '',
      conditions: [{ id: generateId('cond'), object: 'product', metric: 'days_on_hand', operator: 'greater_than', value: 50, value_type: 'percentage' }],
      condition_logic: 'AND',
      actions: [{ id: generateId('act'), object: 'promotion', action: 'create', parameters: {} }],
      scope: null,
    });
    setCreateStep('template');
    setFormErrors({});
    setShowCreateModal(true);
  };

  const handleSelectTemplate = (template) => {
    setNewAutomation({
      name: template.name,
      description: template.description,
      conditions: template.conditions.map(c => ({ ...c, id: generateId('cond') })),
      condition_logic: template.condition_logic,
      actions: template.actions.map(a => ({ ...a, id: generateId('act') })),
      scope: template.scope,
    });
    setCreateStep('builder');
  };

  const handleStartFromScratch = () => {
    setNewAutomation({
      name: '',
      description: '',
      conditions: [{ id: generateId('cond'), object: 'product', metric: 'days_on_hand', operator: 'greater_than', value: 50, value_type: 'percentage' }],
      condition_logic: 'AND',
      actions: [{ id: generateId('act'), object: 'promotion', action: 'create', parameters: {} }],
      scope: null,
    });
    setCreateStep('builder');
  };

  const validateAutomation = () => {
    const errors = {};
    
    if (!newAutomation.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (newAutomation.conditions.length === 0) {
      errors.conditions = 'At least one condition is required';
    }
    
    if (newAutomation.actions.length === 0) {
      errors.actions = 'At least one action is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAutomation = async (status = 'draft') => {
    if (!validateAutomation()) return;
    
    setSaving(true);
    try {
      const payload = {
        name: newAutomation.name,
        description: newAutomation.description,
        status,
        conditions: newAutomation.conditions,
        condition_logic: newAutomation.condition_logic,
        actions: newAutomation.actions,
        scope: newAutomation.scope,
      };
      
      if (editingAutomation) {
        await api.put(`/automations/standalone/${editingAutomation.id}`, payload);
      } else {
        await api.post('/automations/standalone', payload);
      }
      
      setShowCreateModal(false);
      setSearchParams({});
      loadAutomations();
    } catch (err) {
      console.error('Failed to save automation:', err);
      setFormErrors({ general: 'Failed to save automation. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAutomation = async () => {
    if (!editingAutomation) return;
    
    if (!confirm('Are you sure you want to delete this automation?')) return;
    
    try {
      await api.delete(`/automations/standalone/${editingAutomation.id}`);
      setShowCreateModal(false);
      setSearchParams({});
      loadAutomations();
    } catch (err) {
      console.error('Failed to delete automation:', err);
    }
  };

  const getIcon = (automationType) => {
    return AUTOMATION_ICONS[automationType] || AUTOMATION_ICONS.default;
  };

  const getSourceInfo = (sourceType) => {
    return SOURCE_TYPES[sourceType] || { label: sourceType, icon: Zap, color: 'from-slate-500 to-slate-600' };
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Automations
            </h1>
            <p className="text-slate-400">
              Create and manage automated workflows
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={loadAutomations}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-amber-500/25 transition-all"
          >
            <Plus className="w-5 h-5" />
            Create Automation
          </button>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-xl p-4 mb-6 border border-red-500/20 bg-red-500/10">
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : automations.length === 0 ? (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-12 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No Automations Yet
          </h3>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            Create your first automation to automate repetitive tasks, respond to conditions,
            and streamline your workflow.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-amber-500/25 transition-all"
            >
              <Plus className="w-5 h-5" />
              Create Automation
            </button>
            <button
              onClick={() => navigate('/activation/campaigns')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 text-slate-300 rounded-lg font-medium hover:bg-white/10 transition-all"
            >
              <Megaphone className="w-5 h-5" />
              Go to Campaigns
            </button>
          </div>
        </motion.div>
      ) : (
        /* Automations List */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card rounded-xl p-4">
              <div className="text-sm text-slate-400">Total Automations</div>
              <div className="text-2xl font-bold text-white">{automations.length}</div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="text-sm text-slate-400">Running</div>
              <div className="text-2xl font-bold text-green-400">
                {automations.filter(a => a.status === 'running').length}
              </div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="text-sm text-slate-400">Draft / Paused</div>
              <div className="text-2xl font-bold text-amber-400">
                {automations.filter(a => a.status === 'draft' || a.status === 'paused').length}
              </div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="text-sm text-slate-400">Total Triggers</div>
              <div className="text-2xl font-bold text-blue-400">
                {automations.reduce((sum, a) => sum + (a.trigger_count || 0), 0)}
              </div>
            </div>
          </div>

          {/* Automations Table */}
          <div className="glass-card rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Automation
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Configuration
                  </th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Triggers
                  </th>
                  <th className="text-center px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {automations.map(automation => {
                  const Icon = getIcon(automation.automation_type);
                  const sourceInfo = getSourceInfo(automation.source_type);
                  const SourceIcon = sourceInfo.icon;
                  const isLinked = automation.source_type === 'campaign';
                  
                  return (
                    <tr key={automation.id} className="hover:bg-white/5 transition-colors">
                      {/* Automation Type */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center relative">
                            <Icon className="w-5 h-5 text-amber-400" />
                            {/* Linked indicator for campaign-sourced automations */}
                            {isLinked && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                                <Link2 className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-white font-medium">
                              {automation.automation_type_label || automation.source_name}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">
                              {automation.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      {/* Source */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded bg-gradient-to-br ${sourceInfo.color} flex items-center justify-center`}>
                            <SourceIcon className="w-3 h-3 text-white" />
                          </div>
                          <div>
                            <div className="text-sm text-white">{automation.source_name}</div>
                            <div className="text-xs text-slate-500">{sourceInfo.label}</div>
                          </div>
                        </div>
                      </td>
                      
                      {/* Configuration Summary */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">
                          {automation.config_summary}
                        </span>
                      </td>
                      
                      {/* Trigger Count */}
                      <td className="px-6 py-4 text-center">
                        <div className="text-white font-medium">
                          {automation.trigger_count}
                        </div>
                        {automation.last_triggered && (
                          <div className="text-xs text-slate-500">
                            Last: {new Date(automation.last_triggered).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        {automation.status === 'running' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">
                            <Play className="w-3 h-3" />
                            Running
                          </span>
                        ) : automation.status === 'scheduled' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full">
                            <Clock className="w-3 h-3" />
                            Scheduled
                          </span>
                        ) : automation.status === 'draft' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-500/20 text-slate-400 text-xs font-medium rounded-full">
                            <FileText className="w-3 h-3" />
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                            <Pause className="w-3 h-3" />
                            Paused
                          </span>
                        )}
                      </td>
                      
                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Toggle Status - for active campaigns or standalone automations */}
                          {(automation.campaign_status === 'active' || automation.source_type === 'standalone') && automation.status !== 'draft' && (
                            <button
                              onClick={() => handleToggleStatus(automation)}
                              disabled={togglingId === automation.id}
                              className={`p-2 rounded-lg transition-colors ${
                                automation.status === 'running'
                                  ? 'text-green-400 hover:bg-green-500/10'
                                  : 'text-slate-400 hover:bg-slate-500/10'
                              }`}
                              title={automation.status === 'running' ? 'Pause automation' : 'Start automation'}
                            >
                              {togglingId === automation.id ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : automation.status === 'running' ? (
                                <Pause className="w-5 h-5" />
                              ) : (
                                <Play className="w-5 h-5" />
                              )}
                            </button>
                          )}
                          
                          {/* Settings - goes to source object */}
                          <button
                            onClick={() => handleOpenSettings(automation)}
                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Open settings"
                          >
                            <Settings className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Info Note */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/50 border border-white/5">
            <AlertCircle className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400">
              <span className="text-slate-300 font-medium">Note:</span> Automations with a{' '}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-300 text-xs">
                <Link2 className="w-3 h-3" />
                link icon
              </span>{' '}
              are sourced from Campaigns and managed there. Click the <Settings className="w-4 h-4 inline mx-1" /> settings button to edit.
            </div>
          </div>
        </motion.div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-3xl max-h-[90vh] overflow-hidden bg-slate-900 rounded-2xl border border-white/10 shadow-xl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {editingAutomation ? 'Edit Automation' : 'Create Automation'}
                    </h2>
                    <p className="text-sm text-slate-400">
                      {createStep === 'template' ? 'Choose a template or start from scratch' : 'Configure your automation'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                {createStep === 'template' ? (
                  /* Template Selection */
                  <div className="space-y-6">
                    {/* Start from scratch */}
                    <button
                      onClick={handleStartFromScratch}
                      className="w-full p-4 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-xl text-left transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center group-hover:bg-slate-600 transition-colors">
                          <Plus className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <div className="text-white font-medium">Start from Scratch</div>
                          <div className="text-sm text-slate-400">Build a custom automation with your own conditions and actions</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500 ml-auto" />
                      </div>
                    </button>
                    
                    {/* Templates */}
                    <div>
                      <h3 className="text-sm font-medium text-slate-300 mb-3">Or start from a template:</h3>
                      <div className="space-y-3">
                        {AUTOMATION_TEMPLATES.map((template) => {
                          const Icon = AUTOMATION_ICONS[template.id] || Zap;
                          const datasets = template.requires_datasets || [];
                          
                          return (
                            <button
                              key={template.id}
                              onClick={() => handleSelectTemplate(template)}
                              className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left transition-colors group"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                  <Icon className="w-5 h-5 text-amber-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-white font-medium">{template.name}</span>
                                    {datasets.map(ds => (
                                      <span 
                                        key={ds}
                                        className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400"
                                      >
                                        {DATASET_LABELS[ds] || ds}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-sm text-slate-400 line-clamp-2">{template.description}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0 mt-2 group-hover:translate-x-1 transition-transform" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Automation Builder */
                  <div className="space-y-6">
                    {/* Back button */}
                    {!editingAutomation && (
                      <button
                        onClick={() => setCreateStep('template')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                        Back to templates
                      </button>
                    )}
                    
                    {/* Builder */}
                    <AutomationBuilder
                      automation={newAutomation}
                      onChange={setNewAutomation}
                      errors={formErrors}
                    />
                    
                    {/* General error */}
                    {formErrors.general && (
                      <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {formErrors.general}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Modal Footer */}
              {createStep === 'builder' && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-900/50">
                  <div>
                    {editingAutomation && (
                      <button
                        onClick={handleDeleteAutomation}
                        className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveAutomation('draft')}
                      disabled={saving}
                      className="px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      Save as Draft
                    </button>
                    <button
                      onClick={() => handleSaveAutomation('active')}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {editingAutomation ? 'Save & Activate' : 'Create & Activate'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
