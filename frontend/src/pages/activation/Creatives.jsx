import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Image, Plus, Trash2, Check, X, Loader2, Eye, Send,
  ChevronRight, AlertCircle, CheckCircle, Clock, XCircle,
  FileImage, Film, Code, Sparkles, RefreshCw, Edit2,
  ExternalLink, Monitor, Smartphone, Play
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { trackObjectCreate, trackObjectModify, trackObjectDelete, trackObjectStatusChange, OBJECT_TYPES } from '../../services/tracking';

// Status badge colors
const STATUS_STYLES = {
  draft: { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30', icon: Edit2 },
  pending_review: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/30', icon: Clock },
  in_review: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30', icon: Eye },
  approved: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30', icon: CheckCircle },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30', icon: XCircle },
  revision_requested: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/30', icon: AlertCircle },
};

// Format icons
const FORMAT_ICONS = {
  static_image: FileImage,
  animated_gif: Sparkles,
  html5: Code,
  video: Film,
  native: Image,
  rich_media: Play,
};

export default function Creatives() {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit' | 'detail'
  const [creatives, setCreatives] = useState([]);
  const [counts, setCounts] = useState({});
  const [formats, setFormats] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [targetAudiences, setTargetAudiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [simulatingReview, setSimulatingReview] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    format_type: '',
    dimensions: '',
    file_name: '',
    file_size_kb: 0,
    landing_url: '',
    alt_text: '',
    advertiser_name: '',
    contains_animation: false,
    contains_audio: false,
    target_audience: 'general',
    tags: [],
  });
  const [errors, setErrors] = useState({});
  const [mockFilePreview, setMockFilePreview] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [creativesRes, formatsRes] = await Promise.all([
        api.get('/creatives'),
        api.get('/creatives/formats'),
      ]);
      setCreatives(creativesRes.data.creatives || []);
      setCounts(creativesRes.data.counts || {});
      setFormats(formatsRes.data.formats || []);
      setDimensions(formatsRes.data.dimensions || []);
      setTargetAudiences(formatsRes.data.target_audiences || []);
    } catch (error) {
      console.error('Failed to load creatives:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      format_type: '',
      dimensions: '',
      file_name: '',
      file_size_kb: 0,
      landing_url: '',
      alt_text: '',
      advertiser_name: '',
      contains_animation: false,
      contains_audio: false,
      target_audience: 'general',
      tags: [],
    });
    setMockFilePreview(null);
    setErrors({});
    setSelectedCreative(null);
  };

  const handleCreate = () => {
    resetForm();
    setView('create');
  };

  const handleEdit = (creative) => {
    setSelectedCreative(creative);
    setFormData({
      name: creative.name,
      description: creative.description || '',
      format_type: creative.format_type,
      dimensions: creative.dimensions || '',
      file_name: creative.file_name || '',
      file_size_kb: creative.file_size_kb || 0,
      landing_url: creative.landing_url || '',
      alt_text: creative.alt_text || '',
      advertiser_name: creative.advertiser_name || '',
      contains_animation: creative.contains_animation || false,
      contains_audio: creative.contains_audio || false,
      target_audience: creative.target_audience || 'general',
      tags: creative.tags || [],
    });
    setMockFilePreview(creative.file_url);
    setErrors({});
    setView('edit');
  };

  const handleViewDetail = (creative) => {
    setSelectedCreative(creative);
    setView('detail');
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.format_type) newErrors.format_type = 'Format is required';
    if (!formData.dimensions) newErrors.dimensions = 'Dimensions are required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    try {
      setSaving(true);
      
      if (selectedCreative) {
        await api.put(`/creatives/${selectedCreative.id}`, formData);
        trackObjectModify(OBJECT_TYPES.CREATIVE, selectedCreative.id, formData.name, ['content'], {
          format_type: formData.format_type
        });
      } else {
        const response = await api.post('/creatives', formData);
        trackObjectCreate(OBJECT_TYPES.CREATIVE, response.data?.id, formData.name, {
          format_type: formData.format_type,
          dimensions: formData.dimensions
        });
      }
      
      await loadData();
      setView('list');
      resetForm();
    } catch (error) {
      console.error('Failed to save creative:', error);
      setErrors({ submit: extractErrorMessage(error, 'Failed to save creative') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this creative?')) return;
    
    try {
      const creative = creatives.find(c => c.id === id);
      await api.delete(`/creatives/${id}`);
      trackObjectDelete(OBJECT_TYPES.CREATIVE, id, creative?.name);
      await loadData();
      if (view === 'detail') setView('list');
    } catch (error) {
      console.error('Failed to delete creative:', error);
    }
  };

  const handleSubmitForReview = async (id) => {
    try {
      const creative = creatives.find(c => c.id === id);
      const response = await api.post(`/creatives/${id}/submit`);
      trackObjectStatusChange(OBJECT_TYPES.CREATIVE, id, creative?.name, 'draft', 'pending_review');
      // Update the selected creative with the response
      if (selectedCreative?.id === id && response.data.creative) {
        setSelectedCreative(response.data.creative);
      }
      await loadData();
    } catch (error) {
      alert(extractErrorMessage(error, 'Failed to submit for review'));
    }
  };

  const handleSimulateReview = async (id) => {
    try {
      setSimulatingReview(id);
      const creative = creatives.find(c => c.id === id);
      const response = await api.post(`/creatives/${id}/simulate-review`);
      const newStatus = response.data.creative?.status || 'approved';
      trackObjectStatusChange(OBJECT_TYPES.CREATIVE, id, creative?.name, creative?.status, newStatus);
      // Update the selected creative with the response
      if (selectedCreative?.id === id && response.data.creative) {
        setSelectedCreative(response.data.creative);
      }
      await loadData();
    } catch (error) {
      console.error('Failed to simulate review:', error);
    } finally {
      setSimulatingReview(null);
    }
  };

  const handleMockUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Mock file upload - just capture metadata
      setFormData(prev => ({
        ...prev,
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        file_type: file.type,
      }));
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setMockFilePreview(e.target?.result);
        reader.readAsDataURL(file);
      } else {
        setMockFilePreview(null);
      }
    }
  };

  const filteredCreatives = filterStatus 
    ? creatives.filter(c => c.status === filterStatus)
    : creatives;

  const getDimensionCategory = (dim) => {
    const found = dimensions.find(d => d.id === dim);
    return found?.category || 'standard';
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Image className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Creatives
            </h1>
            <p className="text-slate-400">
              Manage ad creatives and track review status
            </p>
          </div>
        </div>
        
        {view === 'list' && (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            New Creative
          </button>
        )}
        
        {(view === 'create' || view === 'edit') && (
          <button
            onClick={() => { resetForm(); setView('list'); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/15 transition-all"
          >
            <X className="w-5 h-5" />
            Cancel
          </button>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {[
                { key: '', label: 'All', count: counts.total || 0 },
                { key: 'draft', label: 'Draft', count: counts.draft || 0 },
                { key: 'pending_review', label: 'Pending', count: counts.pending_review || 0 },
                { key: 'in_review', label: 'In Review', count: counts.in_review || 0 },
                { key: 'approved', label: 'Approved', count: counts.approved || 0 },
                { key: 'rejected', label: 'Rejected', count: (counts.rejected || 0) + (counts.revision_requested || 0) },
              ].map(stat => (
                <button
                  key={stat.key}
                  onClick={() => setFilterStatus(stat.key)}
                  className={`p-4 rounded-xl border transition-all ${
                    filterStatus === stat.key
                      ? 'bg-purple-500/20 border-purple-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="text-2xl font-bold text-white">{stat.count}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </button>
              ))}
            </div>

            {/* Creatives List */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : filteredCreatives.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Image className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {filterStatus ? 'No Creatives Found' : 'No Creatives Yet'}
                </h3>
                <p className="text-slate-400 max-w-md mx-auto mb-6">
                  {filterStatus 
                    ? `No creatives with status "${filterStatus}". Try a different filter.`
                    : 'Create your first ad creative to get started with display campaigns.'}
                </p>
                {!filterStatus && (
                  <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Creative
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCreatives.map(creative => {
                  const statusStyle = STATUS_STYLES[creative.status] || STATUS_STYLES.draft;
                  const StatusIcon = statusStyle.icon;
                  const FormatIcon = FORMAT_ICONS[creative.format_type] || FileImage;
                  
                  return (
                    <motion.div
                      key={creative.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass-card rounded-2xl overflow-hidden hover:ring-2 hover:ring-purple-500/30 transition-all"
                    >
                      {/* Preview */}
                      <div className="h-40 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
                        {creative.file_url && creative.format_type !== 'video' ? (
                          <div className="absolute inset-0 flex items-center justify-center p-4">
                            <div className="text-6xl opacity-30">🖼️</div>
                          </div>
                        ) : (
                          <FormatIcon className="w-16 h-16 text-slate-600" />
                        )}
                        
                        {/* Dimension badge */}
                        <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur rounded text-xs text-white font-mono">
                          {creative.dimensions}
                        </div>
                        
                        {/* Status badge */}
                        <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                          <StatusIcon className="w-3 h-3" />
                          {creative.status_label}
                        </div>
                      </div>
                      
                      {/* Info */}
                      <div className="p-4">
                        <h3 className="font-semibold text-white truncate">{creative.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{creative.format_name}</p>
                        
                        {creative.reviewer_notes && creative.status !== 'approved' && (
                          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300">
                            <strong>Note:</strong> {creative.reviewer_notes}
                          </div>
                        )}
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => handleViewDetail(creative)}
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                          
                          {creative.status === 'draft' && (
                            <button
                              onClick={() => handleEdit(creative)}
                              className="flex items-center justify-center gap-1 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          
                          {creative.status === 'pending_review' && (
                            <button
                              onClick={() => handleSimulateReview(creative.id)}
                              disabled={simulatingReview === creative.id}
                              className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-sm transition-colors disabled:opacity-50"
                              title="Simulate legal review"
                            >
                              {simulatingReview === creative.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {(view === 'create' || view === 'edit') && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="glass-card rounded-2xl p-8 max-w-4xl">
              <h2 className="text-xl font-bold text-white mb-6">
                {selectedCreative ? 'Edit Creative' : 'Create New Creative'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-5">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Creative Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Summer Sale Banner 300x250"
                      className={`w-full bg-slate-800 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        errors.name ? 'border-red-500' : 'border-white/10'
                      }`}
                    />
                    {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of the creative..."
                      rows={3}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Format Type */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Format Type <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {formats.map(format => {
                        const Icon = FORMAT_ICONS[format.id] || FileImage;
                        return (
                          <button
                            key={format.id}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, format_type: format.id }))}
                            className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                              formData.format_type === format.id
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-sm">{format.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {errors.format_type && <p className="text-red-400 text-sm mt-1">{errors.format_type}</p>}
                  </div>

                  {/* Dimensions */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Dimensions <span className="text-red-400">*</span>
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, _dimCategory: 'standard' }))}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            (formData._dimCategory || 'standard') === 'standard'
                              ? 'bg-purple-500/30 text-purple-300'
                              : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          <Monitor className="w-3 h-3 inline mr-1" /> Desktop
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, _dimCategory: 'mobile' }))}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            formData._dimCategory === 'mobile'
                              ? 'bg-purple-500/30 text-purple-300'
                              : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          <Smartphone className="w-3 h-3 inline mr-1" /> Mobile
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, _dimCategory: 'video' }))}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            formData._dimCategory === 'video'
                              ? 'bg-purple-500/30 text-purple-300'
                              : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          <Film className="w-3 h-3 inline mr-1" /> Video
                        </button>
                      </div>
                      <select
                        value={formData.dimensions}
                        onChange={(e) => setFormData(prev => ({ ...prev, dimensions: e.target.value }))}
                        className={`w-full bg-slate-800 border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                          errors.dimensions ? 'border-red-500' : 'border-white/10'
                        }`}
                      >
                        <option value="">Select dimensions...</option>
                        {dimensions
                          .filter(d => d.category === (formData._dimCategory || 'standard'))
                          .map(dim => (
                            <option key={dim.id} value={dim.id}>
                              {dim.id} - {dim.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    {errors.dimensions && <p className="text-red-400 text-sm mt-1">{errors.dimensions}</p>}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-5">
                  {/* File Upload (Mock) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Creative File
                    </label>
                    <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center hover:border-purple-500/50 transition-colors">
                      {mockFilePreview || formData.file_name ? (
                        <div className="space-y-3">
                          {mockFilePreview && typeof mockFilePreview === 'string' && mockFilePreview.startsWith('data:image') ? (
                            <img 
                              src={mockFilePreview} 
                              alt="Preview" 
                              className="max-h-32 mx-auto rounded-lg"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto">
                              <FileImage className="w-8 h-8 text-purple-400" />
                            </div>
                          )}
                          <p className="text-sm text-slate-300">{formData.file_name}</p>
                          <p className="text-xs text-slate-500">{formData.file_size_kb} KB</p>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, file_name: '', file_size_kb: 0 }));
                              setMockFilePreview(null);
                            }}
                            className="text-sm text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*,video/*,.zip"
                            onChange={handleMockUpload}
                            className="hidden"
                          />
                          <FileImage className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                          <p className="text-slate-400">Click to upload creative</p>
                          <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF, MP4, or ZIP</p>
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-amber-400 mt-2">
                      ⚠️ This is a mock upload for demo purposes
                    </p>
                  </div>

                  {/* Landing URL */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Landing URL
                    </label>
                    <input
                      type="url"
                      value={formData.landing_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, landing_url: e.target.value }))}
                      placeholder="https://example.com/landing-page"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Advertiser Name */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Advertiser Name
                    </label>
                    <input
                      type="text"
                      value={formData.advertiser_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, advertiser_name: e.target.value }))}
                      placeholder="Brand name shown on the ad"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Alt Text */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Alt Text (Accessibility)
                    </label>
                    <input
                      type="text"
                      value={formData.alt_text}
                      onChange={(e) => setFormData(prev => ({ ...prev, alt_text: e.target.value }))}
                      placeholder="Description for screen readers"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Target Audience */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Target Audience
                    </label>
                    <select
                      value={formData.target_audience}
                      onChange={(e) => setFormData(prev => ({ ...prev, target_audience: e.target.value }))}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {targetAudiences.map(aud => (
                        <option key={aud.id} value={aud.id}>{aud.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Flags */}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.contains_animation}
                        onChange={(e) => setFormData(prev => ({ ...prev, contains_animation: e.target.checked }))}
                        className="rounded bg-slate-800 border-white/20"
                      />
                      Contains Animation
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.contains_audio}
                        onChange={(e) => setFormData(prev => ({ ...prev, contains_audio: e.target.checked }))}
                        className="rounded bg-slate-800 border-white/20"
                      />
                      Contains Audio
                    </label>
                  </div>
                </div>
              </div>

              {/* Error */}
              {errors.submit && (
                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                  {errors.submit}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-4 mt-8 pt-6 border-t border-white/10">
                <button
                  onClick={() => { resetForm(); setView('list'); }}
                  className="px-6 py-3 border border-white/10 text-slate-300 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      {selectedCreative ? 'Update Creative' : 'Save as Draft'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'detail' && selectedCreative && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to Creatives
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Preview */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
                <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center">
                  {selectedCreative.file_url ? (
                    <div className="text-6xl">🖼️</div>
                  ) : (
                    <FileImage className="w-16 h-16 text-slate-600" />
                  )}
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Dimensions</span>
                    <span className="text-white font-mono">{selectedCreative.dimensions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Format</span>
                    <span className="text-white">{selectedCreative.format_name}</span>
                  </div>
                  {selectedCreative.file_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">File</span>
                      <span className="text-white truncate max-w-[150px]">{selectedCreative.file_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="lg:col-span-2 glass-card rounded-2xl p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedCreative.name}</h2>
                    {selectedCreative.description && (
                      <p className="text-slate-400 mt-1">{selectedCreative.description}</p>
                    )}
                  </div>
                  
                  {(() => {
                    const statusStyle = STATUS_STYLES[selectedCreative.status] || STATUS_STYLES.draft;
                    const StatusIcon = statusStyle.icon;
                    return (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border}`}>
                        <StatusIcon className="w-4 h-4" />
                        <span className="font-medium">{selectedCreative.status_label}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Review Notes */}
                {selectedCreative.reviewer_notes && (
                  <div className={`p-4 rounded-xl mb-6 ${
                    selectedCreative.status === 'approved' ? 'bg-green-500/10 border border-green-500/20' :
                    selectedCreative.status === 'rejected' ? 'bg-red-500/10 border border-red-500/20' :
                    'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    <h4 className="text-sm font-medium text-white mb-1">Review Notes</h4>
                    <p className={`text-sm ${
                      selectedCreative.status === 'approved' ? 'text-green-300' :
                      selectedCreative.status === 'rejected' ? 'text-red-300' :
                      'text-amber-300'
                    }`}>
                      {selectedCreative.reviewer_notes}
                    </p>
                    {selectedCreative.reviewer_name && (
                      <p className="text-xs text-slate-500 mt-2">— {selectedCreative.reviewer_name}</p>
                    )}
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {selectedCreative.landing_url && (
                    <div>
                      <span className="text-sm text-slate-400">Landing URL</span>
                      <a href={selectedCreative.landing_url} target="_blank" rel="noopener noreferrer" 
                         className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm truncate">
                        {selectedCreative.landing_url}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                  )}
                  {selectedCreative.advertiser_name && (
                    <div>
                      <span className="text-sm text-slate-400">Advertiser</span>
                      <p className="text-white">{selectedCreative.advertiser_name}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-slate-400">Target Audience</span>
                    <p className="text-white capitalize">{selectedCreative.target_audience?.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-sm text-slate-400">Created</span>
                    <p className="text-white">{new Date(selectedCreative.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-6 border-t border-white/10">
                  {selectedCreative.status === 'draft' && (
                    <>
                      <button
                        onClick={() => handleEdit(selectedCreative)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleSubmitForReview(selectedCreative.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium"
                      >
                        <Send className="w-4 h-4" />
                        Submit for Review
                      </button>
                    </>
                  )}
                  
                  {selectedCreative.status === 'pending_review' && (
                    <button
                      onClick={() => handleSimulateReview(selectedCreative.id)}
                      disabled={simulatingReview === selectedCreative.id}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium disabled:opacity-50"
                    >
                      {simulatingReview === selectedCreative.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Simulating Review...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Simulate Legal Review
                        </>
                      )}
                    </button>
                  )}
                  
                  {['revision_requested', 'rejected'].includes(selectedCreative.status) && (
                    <button
                      onClick={() => handleEdit(selectedCreative)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium"
                    >
                      <Edit2 className="w-4 h-4" />
                      Make Revisions
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDelete(selectedCreative.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

