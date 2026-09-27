import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Save, ChevronDown, X, Trash2, Check } from 'lucide-react';
import api from '../services/api';
import { trackActivity } from '../services/tracking';

export default function SavedPresets({ 
  reportType, 
  currentParams, 
  onLoadPreset,
  className = ''
}) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true); // Start as true since we fetch on mount
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  useEffect(() => {
    fetchPresets();
  }, [reportType]);

  const fetchPresets = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/saved-reports?report_type=${reportType}`);
      setPresets(response.data.saved_reports || []);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    
    setSaving(true);
    try {
      await api.post('/saved-reports', {
        report_type: reportType,
        report_name: saveName.trim(),
        parameters: currentParams
      });
      
      // Track preset save
      trackActivity('preset_save', `${reportType}: ${saveName.trim()}`, { 
        report_type: reportType, 
        preset_name: saveName.trim() 
      });
      
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveName('');
        setSaveSuccess(false);
        fetchPresets();
      }, 1000);
    } catch (error) {
      console.error('Failed to save preset:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, presetId, presetName) => {
    e.stopPropagation();
    try {
      await api.delete(`/saved-reports/${presetId}`);
      setPresets(prev => prev.filter(p => p.id !== presetId));
      
      // Track preset delete
      trackActivity('preset_delete', `${reportType}: ${presetName}`, { 
        report_type: reportType, 
        preset_name: presetName 
      });
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  };

  const handleLoadPreset = (preset) => {
    // Track preset load
    trackActivity('preset_load', `${reportType}: ${preset.report_name}`, { 
      report_type: reportType, 
      preset_name: preset.report_name,
      parameters: preset.parameters
    });
    
    onLoadPreset(preset.parameters);
    setShowDropdown(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Load Preset Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300 transition-colors"
        >
          <Bookmark className="w-4 h-4" />
          <span>Saved Presets</span>
          {!loading && presets.length > 0 && (
            <span className="bg-retail-500/30 text-retail-300 text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {presets.length}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showDropdown && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowDropdown(false)}
              />
              
              {/* Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-2 w-64 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                {loading ? (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    <div className="w-5 h-5 border-2 border-slate-500 border-t-retail-400 rounded-full animate-spin mx-auto mb-2"></div>
                    Loading presets...
                  </div>
                ) : presets.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">
                    No saved presets yet
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {presets.map(preset => (
                      <div
                        key={preset.id}
                        onClick={() => handleLoadPreset(preset)}
                        className="flex items-center justify-between px-4 py-3 hover:bg-white/5 cursor-pointer group border-b border-white/5 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {preset.report_name}
                          </p>
                          <p className="text-slate-500 text-xs">
                            {formatDate(preset.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, preset.id, preset.report_name)}
                          className="p-1.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Save Button */}
      <button
        onClick={() => setShowSaveModal(true)}
        className="flex items-center gap-2 px-3 py-2 bg-retail-500/20 hover:bg-retail-500/30 border border-retail-500/30 rounded-lg text-sm text-retail-300 transition-colors"
      >
        <Save className="w-4 h-4" />
        <span>Save</span>
      </button>

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setShowSaveModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-display font-semibold text-white">
                  Save Preset
                </h3>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {saveSuccess ? (
                <div className="flex items-center justify-center gap-2 py-8 text-green-400">
                  <Check className="w-6 h-6" />
                  <span className="text-lg font-medium">Saved!</span>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-sm mb-4">
                    Save your current selections as a preset for quick access later.
                  </p>

                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Enter preset name..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-retail-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  />

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saving}
                      className="px-4 py-2 bg-retail-500 hover:bg-retail-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Preset'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

