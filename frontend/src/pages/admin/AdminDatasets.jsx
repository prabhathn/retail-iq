import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, RefreshCw, Loader2, AlertCircle, Check, X,
  ChevronDown, ChevronRight, Save, Edit2, Power, PowerOff,
  Info, CheckCircle, XCircle, Clock, ExternalLink
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { trackPageView } from '../../services/tracking';

// Connection type icons/colors
const CONNECTION_TYPES = {
  snowflake: { label: 'Snowflake', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  s3: { label: 'Amazon S3', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  api: { label: 'API', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  postgres: { label: 'PostgreSQL', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  mysql: { label: 'MySQL', color: 'text-green-400', bg: 'bg-green-500/20' },
  bigquery: { label: 'BigQuery', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  databricks: { label: 'Databricks', color: 'text-red-400', bg: 'bg-red-500/20' },
};

export default function AdminDatasets() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [datasets, setDatasets] = useState([]);
  const [expandedDataset, setExpandedDataset] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [configText, setConfigText] = useState('');
  const [configError, setConfigError] = useState(null);

  useEffect(() => {
    trackPageView('/admin/datasets', 'Admin Datasets');
    loadDatasets();
  }, []);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const loadDatasets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/admin/datasets/config');
      setDatasets(response.data.datasets || []);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      setError('Failed to load dataset configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (datasetKey) => {
    if (expandedDataset === datasetKey) {
      setExpandedDataset(null);
      setEditingConfig(null);
    } else {
      setExpandedDataset(datasetKey);
      const dataset = datasets.find(d => d.key === datasetKey);
      if (dataset?.config) {
        setConfigText(JSON.stringify(dataset.config, null, 2));
      } else {
        setConfigText('{\n  \n}');
      }
      setEditingConfig(null);
    }
  };

  const handleStartEdit = (datasetKey) => {
    const dataset = datasets.find(d => d.key === datasetKey);
    setConfigText(dataset?.config ? JSON.stringify(dataset.config, null, 2) : '{\n  \n}');
    setEditingConfig(datasetKey);
    setConfigError(null);
  };

  const handleCancelEdit = () => {
    setEditingConfig(null);
    setConfigError(null);
    const dataset = datasets.find(d => d.key === expandedDataset);
    if (dataset?.config) {
      setConfigText(JSON.stringify(dataset.config, null, 2));
    }
  };

  const handleSaveConfig = async (datasetKey) => {
    // Validate JSON
    try {
      JSON.parse(configText);
    } catch (e) {
      setConfigError(`Invalid JSON: ${e.message}`);
      return;
    }

    setSaving(datasetKey);
    setConfigError(null);
    try {
      await api.put(`/admin/datasets/config/${datasetKey}`, {
        config: configText,
      });
      setSuccess(`Configuration saved for ${datasetKey}`);
      setEditingConfig(null);
      loadDatasets();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save configuration'));
    } finally {
      setSaving(null);
    }
  };

  const handleToggleConnection = async (datasetKey, currentState) => {
    setSaving(datasetKey);
    try {
      await api.put(`/admin/datasets/config/${datasetKey}`, {
        is_connected: !currentState,
      });
      setSuccess(`Dataset ${!currentState ? 'connected' : 'disconnected'}`);
      loadDatasets();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update connection status'));
    } finally {
      setSaving(null);
    }
  };

  const handleVerifyConnection = async (datasetKey) => {
    setSaving(datasetKey);
    try {
      await api.post(`/admin/datasets/config/${datasetKey}/verify`);
      setSuccess(`Dataset '${datasetKey}' verified and marked as connected`);
      loadDatasets();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to verify connection'));
    } finally {
      setSaving(null);
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('This will create default configurations for any datasets without config. Continue?')) {
      return;
    }
    
    setSaving('seed');
    try {
      const response = await api.post('/admin/datasets/config/seed');
      setSuccess(response.data.message);
      loadDatasets();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to seed defaults'));
    } finally {
      setSaving(null);
    }
  };

  const getConnectionType = (config) => {
    if (!config) return null;
    const type = config.type?.toLowerCase();
    return CONNECTION_TYPES[type] || { label: config.type || 'Unknown', color: 'text-slate-400', bg: 'bg-slate-500/20' };
  };

  // Stats
  const connectedCount = datasets.filter(d => d.is_connected).length;
  const disconnectedCount = datasets.filter(d => !d.is_connected).length;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Mockup Notice */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-300">
          <span className="font-medium">Mockup Notice:</span> This page demonstrates the dataset connection configuration interface. 
          Connection verification and actual data source integration are not fully implemented. 
          Configuration changes are saved but do not affect runtime behavior.
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
            <Database className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Dataset Connections</h1>
            <p className="text-slate-400">Configure data source connections for each dataset</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedDefaults}
            disabled={saving === 'seed'}
            className="px-4 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2"
          >
            {saving === 'seed' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Seed Defaults
          </button>
          <button
            onClick={loadDatasets}
            disabled={loading}
            className="px-4 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Total Datasets</div>
          <div className="text-2xl font-bold text-white">{datasets.length}</div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Connected</div>
          <div className="text-2xl font-bold text-green-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {connectedCount}
          </div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-sm text-slate-400">Not Connected</div>
          <div className="text-2xl font-bold text-slate-400 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {disconnectedCount}
          </div>
        </div>
      </div>

      {/* Dataset List */}
      <div className="space-y-3">
        {datasets.map(dataset => {
          const isExpanded = expandedDataset === dataset.key;
          const isEditing = editingConfig === dataset.key;
          const isSaving = saving === dataset.key;
          const connType = getConnectionType(dataset.config);
          
          return (
            <div
              key={dataset.key}
              className={`glass-card rounded-xl overflow-hidden border ${
                dataset.is_connected 
                  ? 'border-green-500/20' 
                  : 'border-slate-700/50'
              }`}
            >
              {/* Header Row */}
              <button
                onClick={() => handleToggleExpand(dataset.key)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                  
                  <div className="text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{dataset.label}</span>
                      {dataset.is_connected ? (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 text-xs rounded flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Not Connected
                        </span>
                      )}
                      {connType && (
                        <span className={`px-2 py-0.5 ${connType.bg} ${connType.color} text-xs rounded`}>
                          {connType.label}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {dataset.key} • {dataset.description}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                  {dataset.last_verified_at && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Verified {new Date(dataset.last_verified_at).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => handleToggleConnection(dataset.key, dataset.is_connected)}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${
                      dataset.is_connected
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : dataset.is_connected ? (
                      <PowerOff className="w-3 h-3" />
                    ) : (
                      <Power className="w-3 h-3" />
                    )}
                    {dataset.is_connected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              </button>
              
              {/* Expanded Config Editor */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 pt-2 border-t border-slate-700/50">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-slate-300">
                          Connection Configuration (JSON)
                        </h4>
                        <div className="flex items-center gap-2">
                          {!isEditing ? (
                            <button
                              onClick={() => handleStartEdit(dataset.key)}
                              className="px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              Edit
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveConfig(dataset.key)}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 flex items-center gap-1"
                              >
                                {isSaving ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Save
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleVerifyConnection(dataset.key)}
                            disabled={isSaving}
                            className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 flex items-center gap-1"
                          >
                            {isSaving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            Verify & Connect
                          </button>
                        </div>
                      </div>
                      
                      {configError && (
                        <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400">
                          {configError}
                        </div>
                      )}
                      
                      <textarea
                        value={configText}
                        onChange={(e) => setConfigText(e.target.value)}
                        readOnly={!isEditing}
                        className={`w-full h-64 p-4 font-mono text-sm rounded-lg border focus:outline-none ${
                          isEditing
                            ? 'bg-slate-900 border-cyan-500/50 text-white'
                            : 'bg-slate-800/50 border-slate-700 text-slate-400'
                        }`}
                        placeholder="{\n  // Enter JSON configuration\n}"
                      />
                      
                      <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
                        <div className="flex items-start gap-2 text-xs text-slate-400">
                          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium text-slate-300 mb-1">Configuration Format</p>
                            <p>
                              Use environment variable placeholders like <code className="text-cyan-400">${'${SNOWFLAKE_DATABASE}'}</code> for 
                              sensitive values. Common fields: <code className="text-cyan-400">type</code>, <code className="text-cyan-400">database</code>, 
                              <code className="text-cyan-400">schema</code>, <code className="text-cyan-400">table</code>, <code className="text-cyan-400">bucket</code>, 
                              <code className="text-cyan-400">api_key_env</code>.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {dataset.updated_at && (
                        <div className="mt-3 text-xs text-slate-500">
                          Last updated: {new Date(dataset.updated_at).toLocaleString()}
                          {dataset.updated_by && ` by ${dataset.updated_by}`}
                        </div>
                      )}
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
          <span className="text-slate-300 font-medium">Note:</span> Dataset connections determine which 
          modules are available. When a dataset is disconnected, modules that require it can be automatically 
          disabled from the <a href="/admin/modules" className="text-cyan-400 hover:underline">Module Management</a> page.
        </div>
      </div>
    </div>
  );
}
