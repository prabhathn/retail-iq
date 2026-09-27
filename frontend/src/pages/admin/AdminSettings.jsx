import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Network, Image, Maximize2, Plus, Edit2, Trash2, 
  Save, X, ChevronDown, ChevronRight, Loader2, RefreshCw,
  Check, AlertCircle, Eye, EyeOff, CalendarClock
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { trackPageView } from '../../services/tracking';
import DataWindowPanel from '../../components/admin/DataWindowPanel';

// Tab configuration
const TABS = [
  { id: 'ad_networks', label: 'Ad Networks', icon: Network },
  { id: 'creative_formats', label: 'Creative Formats', icon: Image },
  { id: 'ad_dimensions', label: 'Ad Dimensions', icon: Maximize2 },
  { id: 'data_window', label: 'Data Window', icon: CalendarClock },
];

const NETWORK_CATEGORIES = [
  { id: 'digital', label: 'Digital Ad Networks' },
  { id: 'instore', label: 'In-Store Networks' },
];

const DIMENSION_CATEGORIES = [
  { id: 'standard', label: 'Standard Display' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'video', label: 'Video' },
  { id: 'native', label: 'Native/Social' },
];

const CREDENTIAL_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'password', label: 'Password/Secret' },
];

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('ad_networks');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data state
  const [adNetworks, setAdNetworks] = useState([]);
  const [creativeFormats, setCreativeFormats] = useState([]);
  const [adDimensions, setAdDimensions] = useState([]);
  
  // Form state
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  
  // Initial load
  useEffect(() => {
    trackPageView('/admin/settings', 'Admin Settings');
    loadAllData();
  }, []);
  
  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [networksRes, formatsRes, dimensionsRes] = await Promise.all([
        api.get('/config/ad-networks?include_inactive=true'),
        api.get('/config/creative-formats?include_inactive=true'),
        api.get('/config/ad-dimensions?include_inactive=true'),
      ]);
      setAdNetworks(networksRes.data);
      setCreativeFormats(formatsRes.data);
      setAdDimensions(dimensionsRes.data);
    } catch (err) {
      console.error('Failed to load config data:', err);
      setError('Failed to load configuration data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSeedData = async () => {
    if (!confirm('This will add any missing default configurations. Continue?')) return;
    
    setSaving(true);
    try {
      const response = await api.post('/config/seed');
      setSuccess(`Seeded: ${response.data.created.ad_networks} networks, ${response.data.created.creative_formats} formats, ${response.data.created.ad_dimensions} dimensions`);
      loadAllData();
    } catch (err) {
      setError('Failed to seed data');
    } finally {
      setSaving(false);
    }
  };
  
  // Clear messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);
  
  const startCreate = () => {
    setEditingItem(null);
    setFormData(getDefaultFormData());
    setShowForm(true);
  };
  
  const startEdit = (item) => {
    setEditingItem(item);
    setFormData(itemToFormData(item));
    setShowForm(true);
  };
  
  const getDefaultFormData = () => {
    switch (activeTab) {
      case 'ad_networks':
        return {
          network_id: '',
          name: '',
          icon: '🔗',
          category: 'digital',
          credentials: [{ key: '', label: '', type: 'text', placeholder: '', required: true }],
          sort_order: 0,
          is_active: true,
        };
      case 'creative_formats':
        return {
          format_id: '',
          name: '',
          description: '',
          file_types: ['image/png'],
          max_size_kb: 150,
          sort_order: 0,
          is_active: true,
        };
      case 'ad_dimensions':
        return {
          dimension_id: '',
          name: '',
          width: 300,
          height: 250,
          category: 'standard',
          sort_order: 0,
          is_active: true,
        };
      default:
        return {};
    }
  };
  
  const itemToFormData = (item) => {
    switch (activeTab) {
      case 'ad_networks':
        return {
          network_id: item.network_id,
          name: item.name,
          icon: item.icon,
          category: item.category,
          credentials: item.credentials || [],
          sort_order: item.sort_order || 0,
          is_active: item.is_active,
        };
      case 'creative_formats':
        return {
          format_id: item.format_id,
          name: item.name,
          description: item.description || '',
          file_types: item.file_types || [],
          max_size_kb: item.max_size_kb || 150,
          sort_order: item.sort_order || 0,
          is_active: item.is_active,
        };
      case 'ad_dimensions':
        return {
          dimension_id: item.dimension_id,
          name: item.name,
          width: item.width,
          height: item.height,
          category: item.category,
          sort_order: item.sort_order || 0,
          is_active: item.is_active,
        };
      default:
        return item;
    }
  };
  
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      if (activeTab === 'ad_networks') {
        if (editingItem) {
          await api.put(`/config/ad-networks/${formData.network_id}`, null, {
            params: {
              name: formData.name,
              icon: formData.icon,
              category: formData.category,
              is_active: formData.is_active,
              sort_order: formData.sort_order,
              credentials: JSON.stringify(formData.credentials),
            }
          });
        } else {
          await api.post('/config/ad-networks', null, {
            params: {
              network_id: formData.network_id,
              name: formData.name,
              icon: formData.icon,
              category: formData.category,
              sort_order: formData.sort_order,
              credentials: JSON.stringify(formData.credentials),
            }
          });
        }
      } else if (activeTab === 'creative_formats') {
        if (editingItem) {
          await api.put(`/config/creative-formats/${formData.format_id}`, null, {
            params: {
              name: formData.name,
              description: formData.description,
              is_active: formData.is_active,
              sort_order: formData.sort_order,
              max_size_kb: formData.max_size_kb,
              file_types: JSON.stringify(formData.file_types),
            }
          });
        } else {
          await api.post('/config/creative-formats', null, {
            params: {
              format_id: formData.format_id,
              name: formData.name,
              description: formData.description,
              sort_order: formData.sort_order,
              max_size_kb: formData.max_size_kb,
              file_types: JSON.stringify(formData.file_types),
            }
          });
        }
      } else if (activeTab === 'ad_dimensions') {
        if (editingItem) {
          await api.put(`/config/ad-dimensions/${formData.dimension_id}`, null, {
            params: {
              name: formData.name,
              width: formData.width,
              height: formData.height,
              category: formData.category,
              is_active: formData.is_active,
              sort_order: formData.sort_order,
            }
          });
        } else {
          await api.post('/config/ad-dimensions', null, {
            params: {
              dimension_id: formData.dimension_id,
              name: formData.name,
              width: formData.width,
              height: formData.height,
              category: formData.category,
              sort_order: formData.sort_order,
            }
          });
        }
      }
      
      setSuccess(editingItem ? 'Updated successfully' : 'Created successfully');
      setShowForm(false);
      loadAllData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async (item) => {
    const idField = activeTab === 'ad_networks' ? 'network_id' : 
                    activeTab === 'creative_formats' ? 'format_id' : 'dimension_id';
    const id = item[idField];
    
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    
    try {
      await api.delete(`/config/${activeTab.replace('_', '-')}/${id}`);
      setSuccess('Deleted successfully');
      loadAllData();
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to delete'));
    }
  };
  
  const handleToggleActive = async (item) => {
    const idField = activeTab === 'ad_networks' ? 'network_id' : 
                    activeTab === 'creative_formats' ? 'format_id' : 'dimension_id';
    const id = item[idField];
    
    try {
      await api.put(`/config/${activeTab.replace('_', '-')}/${id}`, null, {
        params: { is_active: !item.is_active }
      });
      loadAllData();
    } catch (err) {
      setError('Failed to update status');
    }
  };
  
  // Add/remove credential field
  const addCredentialField = () => {
    setFormData(prev => ({
      ...prev,
      credentials: [...prev.credentials, { key: '', label: '', type: 'text', placeholder: '', required: false }]
    }));
  };
  
  const removeCredentialField = (index) => {
    setFormData(prev => ({
      ...prev,
      credentials: prev.credentials.filter((_, i) => i !== index)
    }));
  };
  
  const updateCredentialField = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      credentials: prev.credentials.map((cred, i) => 
        i === index ? { ...cred, [field]: value } : cred
      )
    }));
  };
  
  // Add/remove file type
  const addFileType = () => {
    setFormData(prev => ({
      ...prev,
      file_types: [...prev.file_types, '']
    }));
  };
  
  const removeFileType = (index) => {
    setFormData(prev => ({
      ...prev,
      file_types: prev.file_types.filter((_, i) => i !== index)
    }));
  };
  
  const updateFileType = (index, value) => {
    setFormData(prev => ({
      ...prev,
      file_types: prev.file_types.map((ft, i) => i === index ? value : ft)
    }));
  };
  
  const renderList = () => {
    const items = activeTab === 'ad_networks' ? adNetworks :
                  activeTab === 'creative_formats' ? creativeFormats : adDimensions;
    
    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-slate-400">
          <p>No {activeTab.replace('_', ' ')} configured yet.</p>
          <button
            onClick={handleSeedData}
            className="mt-4 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Load Default Data
          </button>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-4 rounded-lg border ${item.is_active ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-900/50 border-slate-800 opacity-60'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeTab === 'ad_networks' && (
                  <span className="text-2xl">{item.icon}</span>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{item.name}</span>
                    {!item.is_active && (
                      <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">Inactive</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-400">
                    {activeTab === 'ad_networks' && (
                      <span>{item.network_id} • {item.category} • {item.credentials?.length || 0} credential fields</span>
                    )}
                    {activeTab === 'creative_formats' && (
                      <span>{item.format_id} • Max {item.max_size_kb}KB • {item.file_types?.length || 0} file types</span>
                    )}
                    {activeTab === 'ad_dimensions' && (
                      <span>{item.dimension_id} • {item.width}x{item.height} • {item.category}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(item)}
                  className={`p-2 rounded-lg ${item.is_active ? 'text-green-400 hover:bg-green-500/20' : 'text-slate-500 hover:bg-slate-700'}`}
                  title={item.is_active ? 'Deactivate' : 'Activate'}
                >
                  {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => startEdit(item)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  const renderForm = () => {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {editingItem ? 'Edit' : 'Add New'} {activeTab.replace('_', ' ').replace(/s$/, '')}
          </h3>
          <button
            onClick={() => setShowForm(false)}
            className="p-2 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Form fields based on activeTab */}
        {activeTab === 'ad_networks' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Network ID</label>
                <input
                  type="text"
                  value={formData.network_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, network_id: e.target.value }))}
                  disabled={!!editingItem}
                  placeholder="e.g., facebook, google_display"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Facebook/Meta Ads"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Icon (Emoji)</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder="📘"
                  maxLength={4}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-center text-xl"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                >
                  {NETWORK_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            
            {/* Credentials schema */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-400">Credential Fields</label>
                <button
                  onClick={addCredentialField}
                  className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add Field
                </button>
              </div>
              <div className="space-y-2">
                {formData.credentials?.map((cred, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-slate-900/50 rounded-lg">
                    <input
                      type="text"
                      value={cred.key}
                      onChange={(e) => updateCredentialField(index, 'key', e.target.value)}
                      placeholder="Key (e.g., api_key)"
                      className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <input
                      type="text"
                      value={cred.label}
                      onChange={(e) => updateCredentialField(index, 'label', e.target.value)}
                      placeholder="Label"
                      className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <select
                      value={cred.type}
                      onChange={(e) => updateCredentialField(index, 'type', e.target.value)}
                      className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    >
                      {CREDENTIAL_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        checked={cred.required}
                        onChange={(e) => updateCredentialField(index, 'required', e.target.checked)}
                        className="rounded"
                      />
                      Required
                    </label>
                    <button
                      onClick={() => removeCredentialField(index)}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'creative_formats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Format ID</label>
                <input
                  type="text"
                  value={formData.format_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, format_id: e.target.value }))}
                  disabled={!!editingItem}
                  placeholder="e.g., static_image, video"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Static Image"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this format"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Max File Size (KB)</label>
                <input
                  type="number"
                  value={formData.max_size_kb}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_size_kb: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            
            {/* File types */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-400">Allowed File Types (MIME)</label>
                <button
                  onClick={addFileType}
                  className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add Type
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.file_types?.map((ft, index) => (
                  <div key={index} className="flex items-center gap-1 bg-slate-900/50 rounded px-2 py-1">
                    <input
                      type="text"
                      value={ft}
                      onChange={(e) => updateFileType(index, e.target.value)}
                      placeholder="e.g., image/png"
                      className="w-32 px-2 py-1 bg-transparent text-white text-sm"
                    />
                    <button
                      onClick={() => removeFileType(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'ad_dimensions' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Dimension ID</label>
                <input
                  type="text"
                  value={formData.dimension_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, dimension_id: e.target.value }))}
                  disabled={!!editingItem}
                  placeholder="e.g., 300x250"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Medium Rectangle"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Width (px)</label>
                <input
                  type="number"
                  value={formData.width}
                  onChange={(e) => setFormData(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Height (px)</label>
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => setFormData(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
                >
                  {DIMENSION_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Sort Order</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-24 px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white"
              />
            </div>
          </div>
        )}
        
        {/* Save/Cancel buttons */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
          <button
            onClick={() => setShowForm(false)}
            className="px-4 py-2 text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editingItem ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    );
  };
  
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
          <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-xl">
            <Settings className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Other Config</h1>
            <p className="text-slate-400">Manage ad networks, creative formats, and dimensions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeedData}
            disabled={saving}
            className="px-4 py-2 text-slate-400 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            Seed Defaults
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
      
      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setShowForm(false); }}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id !== 'data_window' && (
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">
                  {tab.id === 'ad_networks' ? adNetworks.length :
                   tab.id === 'creative_formats' ? creativeFormats.length : adDimensions.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Data Window is a standalone panel - it has no CRUD list or add form */}
      {activeTab === 'data_window' ? (
        <DataWindowPanel />
      ) : (
        <>
          {/* Add button */}
          <div className="flex justify-end">
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add {activeTab.replace('_', ' ').replace(/s$/, '')}
            </button>
          </div>

          {/* Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {renderForm()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* List */}
          {renderList()}
        </>
      )}
    </div>
  );
}

