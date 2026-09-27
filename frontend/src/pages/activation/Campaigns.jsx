import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Megaphone, Plus, Calendar, Tag, Users, Search, 
  DollarSign, Image, Globe, Play, Pause, Copy, Trash2,
  ChevronDown, ChevronRight, X, Check, Loader2,
  ExternalLink, Target, Sparkles, Share2, AlertCircle, Edit2,
  Bot, Package, RefreshCw, Zap
} from 'lucide-react';
import api from '../../services/api';
import { useFilters } from '../../contexts/FiltersContext';
import { 
  trackObjectCreate, 
  trackObjectDelete, 
  trackObjectModify, 
  trackObjectStatusChange, 
  trackObjectDuplicate,
  OBJECT_TYPES 
} from '../../services/tracking';

// Available agent automations
const AGENT_AUTOMATIONS = {
  inventory_substitution: {
    id: 'inventory_substitution',
    name: 'Auto-Substitute Low Inventory',
    description: 'Automatically substitute targeted items when forecasted inventory falls below threshold',
    icon: RefreshCw,
    gradient: 'from-cyan-500 to-blue-500',
    configFields: [
      { 
        key: 'threshold_percent', 
        label: 'Inventory Threshold', 
        type: 'percent',
        defaultValue: 20,
        description: 'Trigger substitution when inventory forecast drops below this percentage'
      }
    ]
  },
};

// Campaign type configurations
const CAMPAIGN_TYPES = {
  price_promotion: {
    label: 'Price Promotion',
    description: 'Create a discount on specific products',
    icon: DollarSign,
    gradient: 'from-green-500 to-emerald-500',
    bgGlow: 'bg-green-500/20',
  },
  sponsored_listing: {
    label: 'Sponsored Listing',
    description: 'Boost product visibility in search results',
    icon: Search,
    gradient: 'from-blue-500 to-cyan-500',
    bgGlow: 'bg-blue-500/20',
  },
  display_ad_onsite: {
    label: 'Display Ad (Onsite)',
    description: 'Show banner ads on the ecommerce site',
    icon: Image,
    gradient: 'from-purple-500 to-pink-500',
    bgGlow: 'bg-purple-500/20',
  },
  display_ad_offsite: {
    label: 'Display Ad (Offsite)',
    description: 'Advertise on external networks',
    icon: Globe,
    gradient: 'from-orange-500 to-red-500',
    bgGlow: 'bg-orange-500/20',
  },
};

const AD_NETWORKS = [
  { id: 'facebook', name: 'Facebook/Meta Ads', icon: '📘' },
  { id: 'trade_desk', name: 'The Trade Desk', icon: '📊' },
  { id: 'google_display', name: 'Google Display Network', icon: '🌐' },
  { id: 'amazon_dsp', name: 'Amazon DSP', icon: '📦' },
  { id: 'criteo', name: 'Criteo', icon: '🎯' },
  { id: 'liveramp', name: 'LiveRamp', icon: '🔗' },
];

const STATUS_COLORS = {
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  active: 'bg-green-500/20 text-green-300 border-green-500/30',
  paused: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  completed: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export default function Campaigns() {
  const { cohorts, cohortsLoading, categories, brands, fetchCohorts, fetchFilters } = useFilters();
  
  // View state
  const [view, setView] = useState('list'); // 'list' | 'create'
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  
  // Destinations for Display Ad Offsite
  const [destinations, setDestinations] = useState([]);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  
  // Approved creatives for display ads
  const [approvedCreatives, setApprovedCreatives] = useState([]);
  const [creativesLoading, setCreativesLoading] = useState(false);
  
  // Fetch cohorts and filters when component mounts (for targeting dropdowns)
  useEffect(() => {
    fetchCohorts();
    fetchFilters();
  }, []);
  
  // Create form state
  const [selectedType, setSelectedType] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    target_type: null,
    target_upc: '',
    target_brand: '',
    target_category: '',
    // Multi-select product targeting
    product_targets: [], // Array of { type: 'upc'|'brand'|'category', value: string, label: string }
    // Agent automations
    automations: [], // Array of { id: string, config: object }
    cohort_id: null,
    // Type-specific config
    discount_type: 'percent',
    discount_value: 10,
    keywords: '',
    ad_networks: [],
    destination_ids: [], // New: selected destination IDs
    creative_id: null, // Selected approved creative
  });
  
  // Automation form state
  const [automationConfig, setAutomationConfig] = useState({
    inventory_substitution: { threshold_percent: 20 }
  });
  
  // Product search for UPC
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Fetch campaigns, destinations, and creatives on mount
  useEffect(() => {
    fetchCampaigns();
    fetchDestinations();
    fetchApprovedCreatives();
  }, []);
  
  const fetchDestinations = async () => {
    setDestinationsLoading(true);
    try {
      const response = await api.get('/destinations/active/for-campaigns');
      setDestinations(response.data.destinations || []);
    } catch (error) {
      console.error('Failed to fetch destinations:', error);
    } finally {
      setDestinationsLoading(false);
    }
  };
  
  const fetchApprovedCreatives = async () => {
    setCreativesLoading(true);
    try {
      const response = await api.get('/creatives/approved');
      setApprovedCreatives(response.data.creatives || []);
    } catch (error) {
      console.error('Failed to fetch approved creatives:', error);
    } finally {
      setCreativesLoading(false);
    }
  };
  
  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await api.get('/campaigns');
      setCampaigns(response.data.campaigns || []);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const searchProducts = async () => {
    if (!productSearch || productSearch.length < 2) {
      setProductResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      const response = await api.get(`/analytics/products?search=${encodeURIComponent(productSearch)}&limit=10`);
      setProductResults(response.data.products || []);
    } catch (error) {
      console.error('Failed to search products:', error);
    } finally {
      setSearchLoading(false);
    }
  };
  
  const handleCreateCampaign = async () => {
    if (!selectedType || !formData.name) return;
    
    setSaving(true);
    try {
      const configuration = {};
      
      // Add product targets to configuration if any exist
      if (formData.product_targets.length > 0) {
        configuration.product_targets = formData.product_targets;
      }
      
      // Add automations to configuration if any exist
      if (formData.automations.length > 0) {
        configuration.automations = formData.automations;
      }
      
      // Build configuration based on campaign type
      if (selectedType === 'price_promotion') {
        configuration.discount_type = formData.discount_type;
        configuration.discount_value = parseFloat(formData.discount_value);
      } else if (selectedType === 'sponsored_listing') {
        configuration.keywords = formData.keywords.split(',').map(k => k.trim()).filter(Boolean);
      } else if (selectedType === 'display_ad_onsite') {
        configuration.keywords = formData.keywords.split(',').map(k => k.trim()).filter(Boolean);
        configuration.creative_id = formData.creative_id;
      } else if (selectedType === 'display_ad_offsite') {
        configuration.ad_networks = formData.ad_networks;
        configuration.destination_ids = formData.destination_ids;
        configuration.creative_id = formData.creative_id;
      }
      
      // Build automation fields if automations exist
      const hasAutomations = formData.automations.length > 0;
      const firstAutomation = hasAutomations ? formData.automations[0] : null;
      
      const payload = {
        name: formData.name,
        description: formData.description,
        campaign_type: selectedType,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: new Date(formData.end_date).toISOString(),
        target_type: formData.target_type,
        target_upc: formData.target_type === 'upc' ? formData.target_upc : null,
        target_brand: formData.target_type === 'brand' ? formData.target_brand : null,
        target_category: formData.target_type === 'category' ? formData.target_category : null,
        cohort_id: formData.cohort_id ? parseInt(formData.cohort_id) : null,
        configuration,
        // Automation fields for the Automations page
        automation_enabled: hasAutomations,
        automation_type: firstAutomation?.id || null,
        automation_config: firstAutomation?.config || null,
      };
      
      if (editingCampaignId) {
        await api.put(`/campaigns/${editingCampaignId}`, payload);
        trackObjectModify(OBJECT_TYPES.CAMPAIGN, editingCampaignId, payload.name, ['configuration'], {
          campaign_type: selectedType
        });
      } else {
        const response = await api.post('/campaigns', payload);
        trackObjectCreate(OBJECT_TYPES.CAMPAIGN, response.data?.id, payload.name, {
          campaign_type: selectedType,
          has_automations: (formData.automations?.length || 0) > 0,
          target_count: formData.product_targets?.length || 0
        });
      }
      await fetchCampaigns();
      resetForm();
      setView('list');
    } catch (error) {
      console.error('Failed to save campaign:', error);
      alert('Failed to save campaign. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUpdateStatus = async (campaignId, newStatus) => {
    try {
      const campaign = campaigns.find(c => c.id === campaignId);
      const oldStatus = campaign?.status;
      await api.post(`/campaigns/${campaignId}/status?status=${newStatus}`);
      trackObjectStatusChange(OBJECT_TYPES.CAMPAIGN, campaignId, campaign?.name, oldStatus, newStatus);
      await fetchCampaigns();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };
  
  const handleDuplicate = async (campaignId) => {
    try {
      const campaign = campaigns.find(c => c.id === campaignId);
      const response = await api.post(`/campaigns/${campaignId}/duplicate`);
      trackObjectDuplicate(OBJECT_TYPES.CAMPAIGN, campaignId, response.data?.id, campaign?.name);
      await fetchCampaigns();
    } catch (error) {
      console.error('Failed to duplicate campaign:', error);
    }
  };
  
  const handleDelete = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    
    try {
      const campaign = campaigns.find(c => c.id === campaignId);
      await api.delete(`/campaigns/${campaignId}`);
      trackObjectDelete(OBJECT_TYPES.CAMPAIGN, campaignId, campaign?.name);
      await fetchCampaigns();
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
  };
  
  const resetForm = () => {
    setSelectedType(null);
    setFormData({
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      target_type: null,
      target_upc: '',
      target_brand: '',
      target_category: '',
      product_targets: [],
      automations: [],
      cohort_id: null,
      discount_type: 'percent',
      discount_value: 10,
      keywords: '',
      ad_networks: [],
      destination_ids: [],
      creative_id: null,
    });
    setAutomationConfig({
      inventory_substitution: { threshold_percent: 20 }
    });
    setProductSearch('');
    setProductResults([]);
    setEditingCampaignId(null);
  };
  
  const handleEditCampaign = (campaign) => {
    // Parse configuration
    const config = typeof campaign.configuration === 'string' 
      ? JSON.parse(campaign.configuration) 
      : campaign.configuration || {};
    
    // Set campaign type
    setSelectedType(campaign.campaign_type);
    
    // Populate form data
    setFormData({
      name: campaign.name || '',
      description: campaign.description || '',
      start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().split('T')[0] : '',
      end_date: campaign.end_date ? new Date(campaign.end_date).toISOString().split('T')[0] : '',
      target_type: campaign.target_type || null,
      target_upc: campaign.target_upc || '',
      target_brand: campaign.target_brand || '',
      target_category: campaign.target_category || '',
      product_targets: config.product_targets || [],
      automations: config.automations || [],
      cohort_id: campaign.cohort_id || null,
      discount_type: config.discount_type || 'percent',
      discount_value: config.discount_value || 10,
      keywords: Array.isArray(config.keywords) ? config.keywords.join(', ') : (config.keywords || ''),
      ad_networks: config.ad_networks || [],
      destination_ids: config.destination_ids || [],
      creative_id: config.creative_id || null,
    });
    
    // Restore automation configs
    const automationConfigs = { inventory_substitution: { threshold_percent: 20 } };
    (config.automations || []).forEach(auto => {
      if (auto.config) {
        automationConfigs[auto.id] = auto.config;
      }
    });
    setAutomationConfig(automationConfigs);
    
    // Set editing state
    setEditingCampaignId(campaign.id);
    setView('create');
  };
  
  
  // Get default dates
  const getDefaultDates = () => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return {
      start: today.toISOString().split('T')[0],
      end: nextMonth.toISOString().split('T')[0],
    };
  };
  
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  // Campaign type supports product targeting?
  const supportsProductTargeting = selectedType && ['price_promotion', 'sponsored_listing', 'display_ad_onsite', 'display_ad_offsite'].includes(selectedType);
  
  // Campaign type requires product targeting (mandatory)?
  const requiresProduct = selectedType && ['price_promotion', 'sponsored_listing'].includes(selectedType);
  
  // Campaign type supports cohort targeting?
  const supportsCohort = selectedType && ['price_promotion', 'display_ad_onsite', 'display_ad_offsite'].includes(selectedType);
  
  // Helper to add a product target
  const addProductTarget = (type, value, label) => {
    // Check for duplicates
    const exists = formData.product_targets.some(t => t.type === type && t.value === value);
    if (!exists) {
      setFormData(prev => ({
        ...prev,
        product_targets: [...prev.product_targets, { type, value, label }]
      }));
    }
  };
  
  // Helper to remove a product target
  const removeProductTarget = (index) => {
    setFormData(prev => ({
      ...prev,
      product_targets: prev.product_targets.filter((_, i) => i !== index)
    }));
  };
  
  // Helper to add an automation
  const addAutomation = (automationId) => {
    const exists = formData.automations.some(a => a.id === automationId);
    if (!exists) {
      setFormData(prev => ({
        ...prev,
        automations: [...prev.automations, { 
          id: automationId, 
          config: automationConfig[automationId] || {}
        }]
      }));
    }
  };
  
  // Helper to remove an automation
  const removeAutomation = (automationId) => {
    setFormData(prev => ({
      ...prev,
      automations: prev.automations.filter(a => a.id !== automationId)
    }));
  };
  
  // Helper to update automation config
  const updateAutomationConfig = (automationId, key, value) => {
    setAutomationConfig(prev => ({
      ...prev,
      [automationId]: { ...prev[automationId], [key]: value }
    }));
    // Also update in formData if already added
    setFormData(prev => ({
      ...prev,
      automations: prev.automations.map(a => 
        a.id === automationId 
          ? { ...a, config: { ...a.config, [key]: value } }
          : a
      )
    }));
  };
  
  // Check if automation is added
  const isAutomationAdded = (automationId) => {
    return formData.automations.some(a => a.id === automationId);
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Campaigns
            </h1>
            <p className="text-slate-400">
              Create and manage marketing campaigns
            </p>
          </div>
        </div>
        
        {view === 'list' && (
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-lg shadow-orange-500/25"
          >
            <Plus className="w-5 h-5" />
            Create Campaign
          </button>
        )}
        
        {view === 'create' && (
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
        {/* List View */}
        {view === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
                  <Megaphone className="w-8 h-8 text-orange-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No campaigns yet</h3>
                <p className="text-slate-400 mb-6">Create your first campaign to get started</p>
                <button
                  onClick={() => setView('create')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Create Campaign
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => {
                  const typeConfig = CAMPAIGN_TYPES[campaign.campaign_type];
                  const TypeIcon = typeConfig?.icon || Megaphone;
                  
                  return (
                    <motion.div
                      key={campaign.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-card rounded-xl p-5 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${typeConfig?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center flex-shrink-0`}>
                          <TypeIcon className="w-6 h-6 text-white" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-semibold text-white truncate">{campaign.name}</h3>
                              <p className="text-sm text-slate-400">{typeConfig?.label}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[campaign.status]}`}>
                              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                            </span>
                          </div>
                          
                          {/* Meta info */}
                          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
                            </span>
                            {/* Show product targets from configuration */}
                            {(() => {
                              const config = typeof campaign.configuration === 'string' 
                                ? JSON.parse(campaign.configuration || '{}') 
                                : campaign.configuration || {};
                              const targets = config.product_targets || [];
                              if (targets.length > 0) {
                                return (
                                  <span className="flex items-center gap-1">
                                    <Target className="w-4 h-4" />
                                    {targets.length === 1 
                                      ? targets[0].label 
                                      : `${targets.length} targets`}
                                  </span>
                                );
                              }
                              // Fallback to legacy single target
                              if (campaign.target_type) {
                                return (
                                  <span className="flex items-center gap-1">
                                    <Tag className="w-4 h-4" />
                                    {campaign.target_type === 'upc' && campaign.target_upc}
                                    {campaign.target_type === 'brand' && campaign.target_brand}
                                    {campaign.target_type === 'category' && campaign.target_category}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {campaign.cohort_name && (
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {campaign.cohort_name}
                              </span>
                            )}
                            {/* Show automation indicator */}
                            {(() => {
                              const config = typeof campaign.configuration === 'string' 
                                ? JSON.parse(campaign.configuration || '{}') 
                                : campaign.configuration || {};
                              const automations = config.automations || [];
                              if (automations.length > 0) {
                                return (
                                  <span className="flex items-center gap-1 text-cyan-400">
                                    <Bot className="w-4 h-4" />
                                    {automations.length} automation{automations.length > 1 ? 's' : ''}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-4">
                            {campaign.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => handleEditCampaign(campaign)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors text-sm"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(campaign.id, 'scheduled')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
                                >
                                  <Calendar className="w-4 h-4" />
                                  Schedule
                                </button>
                              </>
                            )}
                            {campaign.status === 'scheduled' && (
                              <button
                                onClick={() => handleUpdateStatus(campaign.id, 'active')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                              >
                                <Play className="w-4 h-4" />
                                Activate
                              </button>
                            )}
                            {campaign.status === 'active' && (
                              <button
                                onClick={() => handleUpdateStatus(campaign.id, 'paused')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg hover:bg-amber-500/30 transition-colors text-sm"
                              >
                                <Pause className="w-4 h-4" />
                                Pause
                              </button>
                            )}
                            {campaign.status === 'paused' && (
                              <button
                                onClick={() => handleUpdateStatus(campaign.id, 'active')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                              >
                                <Play className="w-4 h-4" />
                                Resume
                              </button>
                            )}
                            <button
                              onClick={() => handleDuplicate(campaign.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-slate-300 rounded-lg hover:bg-white/15 transition-colors text-sm"
                            >
                              <Copy className="w-4 h-4" />
                              Duplicate
                            </button>
                            <button
                              onClick={() => handleDelete(campaign.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-300 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
        
        {/* Create View */}
        {view === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Step 1: Select Campaign Type */}
            {!selectedType ? (
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-400" />
                  Choose Campaign Type
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(CAMPAIGN_TYPES).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedType(key);
                          const defaults = getDefaultDates();
                          setFormData(prev => ({
                            ...prev,
                            start_date: defaults.start,
                            end_date: defaults.end,
                          }));
                        }}
                        className="p-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-left group"
                      >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center mb-3`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-white font-semibold mb-1 group-hover:text-orange-300 transition-colors">
                          {config.label}
                        </h3>
                        <p className="text-sm text-slate-400">{config.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Selected type indicator */}
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setSelectedType(null)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    ← Back
                  </button>
                  <span className="text-slate-400">Creating:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r ${CAMPAIGN_TYPES[selectedType].gradient} text-white`}>
                    {CAMPAIGN_TYPES[selectedType].label}
                  </span>
                </div>
                
                {/* Campaign Details Form */}
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Campaign Details</h2>
                  
                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Campaign Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter campaign name"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500/50 focus:outline-none transition-colors"
                      />
                    </div>
                    
                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter campaign description"
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500/50 focus:outline-none transition-colors resize-none"
                      />
                    </div>
                    
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Start Date *
                        </label>
                        <input
                          type="date"
                          value={formData.start_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-orange-500/50 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          End Date *
                        </label>
                        <input
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-orange-500/50 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Product Targeting (for applicable types) */}
                {supportsProductTargeting && (
                  <div className="glass-card rounded-2xl p-6 relative z-20">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-400" />
                      Product Targeting
                      {!requiresProduct && (
                        <span className="text-xs text-slate-400 font-normal ml-2">(Optional)</span>
                      )}
                    </h2>
                    
                    <div className="space-y-4">
                      {/* Current Targets List */}
                      {formData.product_targets.length > 0 && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Selected Targets ({formData.product_targets.length})
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {formData.product_targets.map((target, index) => (
                              <div
                                key={`${target.type}-${target.value}-${index}`}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                                  target.type === 'upc' 
                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
                                    : target.type === 'brand'
                                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                                    : 'bg-green-500/20 border-green-500/30 text-green-300'
                                }`}
                              >
                                <span className="text-xs uppercase opacity-70">{target.type}</span>
                                <span className="text-sm font-medium">{target.label}</span>
                                <button
                                  onClick={() => removeProductTarget(index)}
                                  className="ml-1 hover:text-white transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Add Target Section */}
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <label className="block text-sm font-medium text-slate-300 mb-3">
                          Add Target
                        </label>
                        
                        {/* Target Type Selection */}
                        <div className="flex gap-2 mb-3">
                          {['upc', 'brand', 'category'].map((type) => (
                            <button
                              key={type}
                              onClick={() => setFormData(prev => ({ ...prev, target_type: type }))}
                              className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                                formData.target_type === type
                                  ? type === 'upc'
                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                                    : type === 'brand'
                                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                    : 'bg-green-500/20 border-green-500/50 text-green-300'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                              }`}
                            >
                              {type.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        
                        {/* UPC Search */}
                        {formData.target_type === 'upc' && (
                          <div className="relative z-50">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && searchProducts()}
                                placeholder="Search for a product..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none transition-colors"
                              />
                              <button
                                onClick={searchProducts}
                                disabled={searchLoading}
                                className="px-4 py-2.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors"
                              >
                                {searchLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                              </button>
                            </div>
                            
                            {/* Search Results */}
                            {productResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden z-[100] shadow-2xl max-h-60 overflow-y-auto">
                                {productResults.map((product) => (
                                  <button
                                    key={product.UPC}
                                    onClick={() => {
                                      addProductTarget('upc', product.UPC, product.PRODUCT_NAME);
                                      setProductSearch('');
                                      setProductResults([]);
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                  >
                                    <div className="text-white font-medium">{product.PRODUCT_NAME}</div>
                                    <div className="text-sm text-slate-400">
                                      {product.BRAND} • UPC: {product.UPC}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Brand Selection */}
                        {formData.target_type === 'brand' && (
                          <div className="flex gap-2">
                            <select
                              value={formData.target_brand}
                              onChange={(e) => setFormData(prev => ({ ...prev, target_brand: e.target.value }))}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                            >
                              <option value="">Select a brand</option>
                              {brands.map((brand) => (
                                <option key={brand} value={brand}>{brand}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                if (formData.target_brand) {
                                  addProductTarget('brand', formData.target_brand, formData.target_brand);
                                  setFormData(prev => ({ ...prev, target_brand: '' }));
                                }
                              }}
                              disabled={!formData.target_brand}
                              className="px-4 py-2.5 bg-purple-500/20 text-purple-300 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                        
                        {/* Category Selection */}
                        {formData.target_type === 'category' && (
                          <div className="flex gap-2">
                            <select
                              value={formData.target_category}
                              onChange={(e) => setFormData(prev => ({ ...prev, target_category: e.target.value }))}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-green-500/50 focus:outline-none transition-colors"
                            >
                              <option value="">Select a category</option>
                              {categories.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                if (formData.target_category) {
                                  addProductTarget('category', formData.target_category, formData.target_category);
                                  setFormData(prev => ({ ...prev, target_category: '' }));
                                }
                              }}
                              disabled={!formData.target_category}
                              className="px-4 py-2.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                        
                        {!formData.target_type && (
                          <p className="text-sm text-slate-500">
                            Select a target type above to add products, brands, or categories
                          </p>
                        )}
                      </div>
                      
                      {requiresProduct && formData.product_targets.length === 0 && (
                        <p className="text-sm text-amber-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          At least one product target is required for this campaign type
                        </p>
                      )}
                      
                      {/* Agent Automations - appears when products are selected */}
                      <AnimatePresence>
                        {formData.product_targets.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-6 pt-6 border-t border-white/10"
                          >
                            <h3 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
                              <Bot className="w-5 h-5 text-cyan-400" />
                              Agent Automations
                              <span className="text-xs text-slate-400 font-normal ml-1">(Optional)</span>
                            </h3>
                            
                            <div className="space-y-3">
                              {Object.entries(AGENT_AUTOMATIONS).map(([key, automation]) => {
                                const AutoIcon = automation.icon;
                                const isAdded = isAutomationAdded(key);
                                
                                return (
                                  <div
                                    key={key}
                                    className={`p-4 rounded-xl border transition-all ${
                                      isAdded
                                        ? 'bg-cyan-500/10 border-cyan-500/30'
                                        : 'bg-white/5 border-white/10 hover:border-white/20'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${automation.gradient} flex items-center justify-center flex-shrink-0`}>
                                        <AutoIcon className="w-5 h-5 text-white" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                          <h4 className="text-white font-medium">{automation.name}</h4>
                                          {isAdded ? (
                                            <button
                                              onClick={() => removeAutomation(key)}
                                              className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors flex items-center gap-1"
                                            >
                                              <X className="w-3 h-3" />
                                              Remove
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => addAutomation(key)}
                                              className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1"
                                            >
                                              <Plus className="w-3 h-3" />
                                              Add
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-sm text-slate-400 mt-1">{automation.description}</p>
                                        
                                        {/* Configuration fields */}
                                        <AnimatePresence>
                                          {isAdded && automation.configFields && (
                                            <motion.div
                                              initial={{ opacity: 0, height: 0 }}
                                              animate={{ opacity: 1, height: 'auto' }}
                                              exit={{ opacity: 0, height: 0 }}
                                              className="mt-3 pt-3 border-t border-white/10"
                                            >
                                              {automation.configFields.map(field => (
                                                <div key={field.key} className="flex items-center gap-3">
                                                  <label className="text-sm text-slate-300 whitespace-nowrap">
                                                    {field.label}:
                                                  </label>
                                                  {field.type === 'percent' && (
                                                    <div className="flex items-center gap-2">
                                                      <input
                                                        type="range"
                                                        min="5"
                                                        max="50"
                                                        step="5"
                                                        value={automationConfig[key]?.[field.key] || field.defaultValue}
                                                        onChange={(e) => updateAutomationConfig(key, field.key, parseInt(e.target.value))}
                                                        className="w-24 accent-cyan-500"
                                                      />
                                                      <span className="text-cyan-300 font-medium w-12">
                                                        {automationConfig[key]?.[field.key] || field.defaultValue}%
                                                      </span>
                                                    </div>
                                                  )}
                                                  {field.description && (
                                                    <span className="text-xs text-slate-500 hidden lg:inline">
                                                      {field.description}
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {formData.automations.length > 0 && (
                              <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                                <p className="text-sm text-cyan-300 flex items-center gap-2">
                                  <Zap className="w-4 h-4" />
                                  {formData.automations.length} automation{formData.automations.length > 1 ? 's' : ''} will be active for this campaign
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
                
                {/* Audience Targeting (Cohort) */}
                {supportsCohort && (
                  <div className="glass-card rounded-2xl p-6 relative z-10">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-purple-400" />
                      Audience Targeting
                    </h2>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Target Shopper Cohort
                      </label>
                      {cohortsLoading ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading cohorts...
                        </div>
                      ) : (
                        <select
                          value={formData.cohort_id || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, cohort_id: e.target.value || null }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                        >
                          <option value="">All Shoppers (no targeting)</option>
                          {cohorts.map((cohort) => (
                            <option key={cohort.id} value={cohort.id}>
                              {cohort.name} ({cohort.shopper_count?.toLocaleString() || 0} shoppers)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Type-specific Configuration */}
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    {CAMPAIGN_TYPES[selectedType].label} Settings
                  </h2>
                  
                  {/* Price Promotion */}
                  {selectedType === 'price_promotion' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Discount Type
                        </label>
                        <select
                          value={formData.discount_type}
                          onChange={(e) => setFormData(prev => ({ ...prev, discount_type: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-green-500/50 focus:outline-none transition-colors"
                        >
                          <option value="percent">Percentage Off</option>
                          <option value="fixed">Fixed Amount Off</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Discount Value
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={formData.discount_value}
                            onChange={(e) => setFormData(prev => ({ ...prev, discount_value: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:border-green-500/50 focus:outline-none transition-colors pr-12"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                            {formData.discount_type === 'percent' ? '%' : '$'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Sponsored Listing */}
                  {selectedType === 'sponsored_listing' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Search Keywords
                      </label>
                      <input
                        type="text"
                        value={formData.keywords}
                        onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                        placeholder="Enter keywords separated by commas (e.g., milk, dairy, organic)"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-blue-500/50 focus:outline-none transition-colors"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Product will appear at the top of search results for these keywords
                      </p>
                    </div>
                  )}
                  
                  {/* Display Ad Onsite */}
                  {selectedType === 'display_ad_onsite' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Target Keywords (optional)
                        </label>
                        <input
                          type="text"
                          value={formData.keywords}
                          onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                          placeholder="Enter keywords separated by commas"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-purple-500/50 focus:outline-none transition-colors"
                        />
                      </div>
                      
                      {/* Creative Selection */}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Select Creative
                        </label>
                        {creativesLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                          </div>
                        ) : approvedCreatives.length === 0 ? (
                          <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                            <h4 className="text-lg font-medium text-white mb-2">
                              No Approved Creatives
                            </h4>
                            <p className="text-sm text-slate-400 mb-4">
                              You need at least one approved creative to create display campaigns.
                            </p>
                            <Link
                              to="/activation/creatives"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                            >
                              <Image className="w-4 h-4" />
                              Manage Creatives
                            </Link>
                          </div>
                        ) : (
                          <>
                            <select
                              value={formData.creative_id || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, creative_id: e.target.value ? parseInt(e.target.value) : null }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-purple-500/50 focus:outline-none transition-colors"
                            >
                              <option value="">Select a creative...</option>
                              {approvedCreatives.map(creative => (
                                <option key={creative.id} value={creative.id}>
                                  {creative.name} ({creative.dimensions} - {creative.format_name})
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-2">
                              <Link to="/activation/creatives" className="text-purple-400 hover:text-purple-300">
                                Manage creatives →
                              </Link>
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Display Ad Offsite */}
                  {selectedType === 'display_ad_offsite' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Ad Network Destinations
                        </label>
                        
                        {destinationsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                          </div>
                        ) : destinations.length === 0 ? (
                          <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                            <h4 className="text-lg font-medium text-white mb-2">
                              No Destinations Configured
                            </h4>
                            <p className="text-sm text-slate-400 mb-4">
                              You need to set up at least one ad network destination before creating offsite display campaigns.
                            </p>
                            <Link
                              to="/activation/destinations"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all"
                            >
                              <Share2 className="w-4 h-4" />
                              Configure Destinations
                            </Link>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              {destinations.map((dest) => (
                                <button
                                  key={dest.id}
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      destination_ids: prev.destination_ids.includes(dest.id)
                                        ? prev.destination_ids.filter(id => id !== dest.id)
                                        : [...prev.destination_ids, dest.id],
                                      // Also update ad_networks for backwards compatibility
                                      ad_networks: prev.destination_ids.includes(dest.id)
                                        ? prev.ad_networks.filter(n => n !== dest.network_id)
                                        : [...new Set([...prev.ad_networks, dest.network_id])]
                                    }));
                                  }}
                                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                    formData.destination_ids.includes(dest.id)
                                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                                  }`}
                                >
                                  <span className="text-xl">{dest.network_icon}</span>
                                  <div className="flex-1 text-left">
                                    <span className="text-sm font-medium block">{dest.name}</span>
                                    <span className="text-xs text-slate-500">{dest.network_name}</span>
                                  </div>
                                  {dest.is_verified && (
                                    <span className="text-green-400" title="Verified">✓</span>
                                  )}
                                  {formData.destination_ids.includes(dest.id) && (
                                    <Check className="w-4 h-4 text-orange-400" />
                                  )}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                              <Link to="/activation/destinations" className="text-cyan-400 hover:text-cyan-300">
                                Manage destinations →
                              </Link>
                            </p>
                          </>
                        )}
                      </div>
                      
                      {/* Creative Selection */}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Select Creative
                        </label>
                        {creativesLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                          </div>
                        ) : approvedCreatives.length === 0 ? (
                          <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                            <h4 className="text-lg font-medium text-white mb-2">
                              No Approved Creatives
                            </h4>
                            <p className="text-sm text-slate-400 mb-4">
                              You need at least one approved creative to create display campaigns.
                            </p>
                            <Link
                              to="/activation/creatives"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                            >
                              <Image className="w-4 h-4" />
                              Manage Creatives
                            </Link>
                          </div>
                        ) : (
                          <>
                            <select
                              value={formData.creative_id || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, creative_id: e.target.value ? parseInt(e.target.value) : null }))}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-orange-500/50 focus:outline-none transition-colors"
                            >
                              <option value="">Select a creative...</option>
                              {approvedCreatives.map(creative => (
                                <option key={creative.id} value={creative.id}>
                                  {creative.name} ({creative.dimensions} - {creative.format_name})
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-2">
                              <Link to="/activation/creatives" className="text-purple-400 hover:text-purple-300">
                                Manage creatives →
                              </Link>
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Create Button */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { resetForm(); setView('list'); }}
                    className="px-6 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/15 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCampaign}
                    disabled={saving || !formData.name || !formData.start_date || !formData.end_date}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium rounded-xl hover:from-orange-600 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-500/25"
                  >
                    {saving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    {editingCampaignId ? 'Save Changes' : 'Create Campaign'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

