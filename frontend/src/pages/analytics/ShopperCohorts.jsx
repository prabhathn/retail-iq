import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Play, Calendar, Workflow, Shapes, Loader2, Plus, Trash2, Save, Eye, Check, X, Expand, TrendingUp, Target, Sparkles } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis } from 'recharts';
import api, { extractErrorMessage } from '../../services/api';
import SavedPresets from '../../components/SavedPresets';
import { trackReportRun, trackObjectCreate, OBJECT_TYPES } from '../../services/tracking';
import { useFilters } from '../../contexts/FiltersContext';
import { useDateAnchor } from '../../contexts/DateAnchorContext';
import { getToday } from '../../utils/formatters';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];

const TABS = [
  { id: 'define', label: 'Define Your Cohort' },
  { id: 'segment', label: 'Build Your Segmentation' },
  { id: 'expand', label: 'Expand Your Cohort' },
];

export default function ShopperCohorts() {
  const [activeTab, setActiveTab] = useState('define');
  
  // Use shared filters context (cached globally)
  const { filters, filtersLoading, cohorts, refreshCohorts, fetchFilters, fetchCohorts } = useFilters();
  
  // Fetch filters and cohorts when component mounts
  useEffect(() => {
    fetchFilters();
    fetchCohorts();
  }, []);
  
  // Expand Cohort state
  const [selectedSeedCohort, setSelectedSeedCohort] = useState('');
  const [expansionFactor, setExpansionFactor] = useState(2.0);
  const [maxAudienceSize, setMaxAudienceSize] = useState(10000);
  const [expansionLoading, setExpansionLoading] = useState(false);
  const [expansionResult, setExpansionResult] = useState(null);
  const [showExpansionSaveModal, setShowExpansionSaveModal] = useState(false);
  const [expansionCohortName, setExpansionCohortName] = useState('');
  const [savingExpansion, setSavingExpansion] = useState(false);
  const [expansionSaveSuccess, setExpansionSaveSuccess] = useState(false);
  
  // Define Cohort state
  const [conditions, setConditions] = useState([
    { field: 'brand', operator: 'bought', value: '', frequency: 1, amount: 50, days: 30 }
  ]);
  const [conditionLogic, setConditionLogic] = useState('AND');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [savingCohort, setSavingCohort] = useState(false);
  const [cohortName, setCohortName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Segmentation state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [cohortType, setCohortType] = useState('frequency');
  // Dates are seeded from the data-derived anchor, not the browser clock, so the
  // default 6-month window lands inside the dataset even when it has aged.
  const { anchor: dateAnchor, loaded: dateAnchorLoaded } = useDateAnchor();
  const sixMonthsBefore = (ref) => {
    const d = ref ? new Date(`${String(ref).slice(0, 10)}T00:00:00Z`) : new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState(() => sixMonthsBefore(dateAnchor));
  const [endDate, setEndDate] = useState(() => getToday(dateAnchor));
  const [datesTouched, setDatesTouched] = useState(false);

  // Re-seed once the anchor resolves, unless the user already picked dates.
  useEffect(() => {
    if (dateAnchorLoaded && dateAnchor && !datesTouched) {
      setStartDate(sixMonthsBefore(dateAnchor));
      setEndDate(getToday(dateAnchor));
    }
  }, [dateAnchorLoaded, dateAnchor, datesTouched]);

  const [numSegments, setNumSegments] = useState(5);
  const [savingSegment, setSavingSegment] = useState(null);
  const [segmentSaveSuccess, setSegmentSaveSuccess] = useState(null);
  
  // Define Cohort functions
  const addCondition = () => {
    setConditions([...conditions, { field: 'brand', operator: 'bought', value: '', frequency: 1, amount: 50, days: 30 }]);
  };
  
  const removeCondition = (index) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };
  
  const updateCondition = (index, field, value) => {
    const newConditions = [...conditions];
    newConditions[index][field] = value;
    setConditions(newConditions);
  };
  
  const previewCohort = async () => {
    const validConditions = conditions.filter(c => c.value);
    if (validConditions.length === 0) return;
    
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const response = await api.post('/cohorts/preview', {
        conditions: validConditions,
        condition_logic: conditionLogic
      });
      setPreviewResult(response.data);
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setPreviewLoading(false);
    }
  };
  
  const saveCohort = async () => {
    if (!cohortName.trim() || !previewResult) return;
    
    setSavingCohort(true);
    try {
      const validConditions = conditions.filter(c => c.value);
      const response = await api.post('/cohorts', {
        name: cohortName.trim(),
        conditions: validConditions,
        condition_logic: conditionLogic
      });
      trackObjectCreate(OBJECT_TYPES.COHORT, response.data?.id, cohortName.trim(), {
        shopper_count: previewResult?.total_count,
        condition_count: validConditions.length,
        source: 'define'
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveModal(false);
        setCohortName('');
        setSaveSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save cohort: ' + (extractErrorMessage(error)));
    } finally {
      setSavingCohort(false);
    }
  };
  
  // Segmentation functions
  const cohortDescriptions = {
    frequency: 'how often they shop',
    monetary: 'how much they spend',
    recency: 'how recently they visited',
    category_affinity: 'their favorite category'
  };
  
  const runAnalysis = async () => {
    setLoading(true);
    try {
      const params = {
        cohort_type: cohortType,
        start_date: startDate,
        end_date: endDate,
        num_segments: numSegments
      };
      
      trackReportRun('shopper_cohorts', params);
      
      const response = await api.post('/analytics/shopper-cohorts', params);
      setResults(response.data);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const saveSegment = async (segment, index) => {
    setSavingSegment(index);
    try {
      const segmentName = getSegmentLabel(segment);
      const criteria = {};
      
      if (cohortType === 'frequency') {
        criteria.min_visits = segment.MIN_VISITS;
        criteria.max_visits = segment.MAX_VISITS;
      } else if (cohortType === 'monetary') {
        criteria.min_spend = segment.MIN_SPEND;
        criteria.max_spend = segment.MAX_SPEND;
      } else if (cohortType === 'recency') {
        criteria.min_days = segment.MIN_DAYS;
        criteria.max_days = segment.MAX_DAYS;
      } else if (cohortType === 'category_affinity') {
        criteria.category = segment.SEGMENT_NAME;
      }
      
      const cohortNameForSegment = `${cohortType} - ${segmentName}`;
      const response = await api.post('/cohorts/segment', {
        name: cohortNameForSegment,
        description: `Shoppers in the "${segmentName}" segment`,
        segment_type: cohortType,
        segment_name: segmentName,
        segment_criteria: criteria,
        start_date: startDate,
        end_date: endDate
      });
      
      trackObjectCreate(OBJECT_TYPES.COHORT, response.data?.id, cohortNameForSegment, {
        shopper_count: segment.SHOPPER_COUNT,
        segment_type: cohortType,
        source: 'segment'
      });
      
      setSegmentSaveSuccess(index);
      setTimeout(() => setSegmentSaveSuccess(null), 2000);
    } catch (error) {
      console.error('Save segment failed:', error);
      alert('Failed to save segment: ' + (extractErrorMessage(error)));
    } finally {
      setSavingSegment(null);
    }
  };
  
  const getSegmentLabel = (segment) => {
    if (cohortType === 'category_affinity') {
      return segment.SEGMENT_NAME;
    }
    return segment.SEGMENT_NAME || `Segment ${segment.SEGMENT}`;
  };
  
  const getCurrentParams = () => ({
    cohortType,
    startDate,
    endDate,
    numSegments
  });
  
  const loadPreset = (params) => {
    if (params.cohortType) setCohortType(params.cohortType);
    if (params.startDate) { setDatesTouched(true); setStartDate(params.startDate); };
    if (params.endDate) { setDatesTouched(true); setEndDate(params.endDate); };
    if (params.numSegments) setNumSegments(params.numSegments);
  };
  
  // Expansion functions
  const previewExpansion = async () => {
    if (!selectedSeedCohort) return;
    
    setExpansionLoading(true);
    setExpansionResult(null);
    try {
      const params = {
        seed_cohort_id: parseInt(selectedSeedCohort),
        expansion_factor: expansionFactor,
        max_audience_size: maxAudienceSize,
        features: ['categories', 'brands', 'frequency', 'spend']
      };
      
      trackReportRun('lookalike_expansion', params);
      
      const response = await api.post('/cohorts/lookalike/preview', params);
      setExpansionResult(response.data);
    } catch (error) {
      console.error('Expansion preview failed:', error);
      alert('Expansion failed: ' + (extractErrorMessage(error)));
    } finally {
      setExpansionLoading(false);
    }
  };
  
  const saveExpandedCohort = async () => {
    if (!expansionCohortName.trim() || !expansionResult) return;
    
    setSavingExpansion(true);
    try {
      const response = await api.post('/cohorts/lookalike/save', {
        seed_cohort_id: parseInt(selectedSeedCohort),
        lookalike_shopper_ids: expansionResult.all_lookalike_ids,
        name: expansionCohortName.trim(),
        description: `Lookalike expansion from "${expansionResult.seed_cohort.name}" with ${expansionResult.lookalike_count.toLocaleString()} lookalikes`,
        expansion_params: expansionResult.expansion_params
      });
      
      trackObjectCreate(OBJECT_TYPES.COHORT, response.data?.id, expansionCohortName.trim(), {
        shopper_count: expansionResult.total_expanded_count,
        seed_cohort_id: selectedSeedCohort,
        lookalike_count: expansionResult.lookalike_count,
        source: 'lookalike_expansion'
      });
      
      setExpansionSaveSuccess(true);
      setTimeout(() => {
        setShowExpansionSaveModal(false);
        setExpansionCohortName('');
        setExpansionSaveSuccess(false);
        setExpansionResult(null);
        setSelectedSeedCohort('');
        refreshCohorts(); // Refresh cohorts list
      }, 1500);
    } catch (error) {
      console.error('Save expansion failed:', error);
      alert('Failed to save expanded cohort: ' + (extractErrorMessage(error)));
    } finally {
      setSavingExpansion(false);
    }
  };
  
  return (
    <div className="p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Shopper Cohorts
            </h1>
            <p className="text-slate-400">
              Define custom cohorts or segment shoppers by behavior
            </p>
          </div>
        </div>
      </motion.div>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'define' && (
          <motion.div
            key="define"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            {/* Define Your Cohort */}
            <div className="glass-card rounded-2xl p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Workflow className="w-5 h-5 text-orange-400" />
                Define Your Cohort
              </h2>
              
              <div className="space-y-4 mb-6">
                {conditions.map((condition, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-3 p-4 bg-white/5 rounded-xl">
                    {index > 0 && (
                      <select
                        value={conditionLogic}
                        onChange={(e) => setConditionLogic(e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-amber-300 font-medium text-sm"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    )}
                    
                    <span className="text-slate-300">People who</span>
                    
                    <select
                      value={condition.operator}
                      onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                      className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-purple-300 font-medium text-sm"
                    >
                      <option value="bought">bought</option>
                      <option value="bought_times">bought at least X times</option>
                      <option value="spent_more_than">spent more than $X on</option>
                    </select>
                    
                    {condition.operator === 'bought_times' && (
                      <input
                        type="number"
                        value={condition.frequency}
                        onChange={(e) => updateCondition(index, 'frequency', parseInt(e.target.value) || 1)}
                        min="1"
                        className="w-16 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-cyan-300 font-medium text-sm"
                      />
                    )}
                    
                    {condition.operator === 'spent_more_than' && (
                      <div className="flex items-center">
                        <span className="text-slate-400 mr-1">$</span>
                        <input
                          type="number"
                          value={condition.amount}
                          onChange={(e) => updateCondition(index, 'amount', parseFloat(e.target.value) || 0)}
                          min="0"
                          className="w-20 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-cyan-300 font-medium text-sm"
                        />
                      </div>
                    )}
                    
                    <select
                      value={condition.field}
                      onChange={(e) => updateCondition(index, 'field', e.target.value)}
                      className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-pink-300 font-medium text-sm"
                    >
                      <option value="brand">brand</option>
                      <option value="category">category</option>
                    </select>
                    
                    {filtersLoading ? (
                      <span className="text-slate-400 text-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                      </span>
                    ) : (
                      <select
                        value={condition.value}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-green-300 font-medium text-sm min-w-[150px]"
                      >
                        <option value="">Select {condition.field}...</option>
                        {condition.field === 'brand' && filters?.brands?.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                        {condition.field === 'category' && filters?.categories?.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                    
                    <span className="text-slate-300">in the last</span>
                    
                    <select
                      value={condition.days}
                      onChange={(e) => updateCondition(index, 'days', parseInt(e.target.value))}
                      className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-amber-300 font-medium text-sm"
                    >
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                      <option value={180}>180 days</option>
                      <option value={365}>1 year</option>
                    </select>
                    
                    {conditions.length > 1 && (
                      <button
                        onClick={() => removeCondition(index)}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                onClick={addCondition}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add another condition
              </button>
              
              {/* Actions */}
              <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-4">
                <button
                  onClick={previewCohort}
                  disabled={previewLoading || !conditions.some(c => c.value)}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-orange-600 hover:to-red-600 transition-all duration-200 shadow-lg shadow-orange-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {previewLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                  Preview Cohort
                </button>
                
                {previewResult && (
                  <button
                    onClick={() => setShowSaveModal(true)}
                    className="bg-retail-500/20 hover:bg-retail-500/30 border border-retail-500/30 text-retail-300 font-semibold py-3 px-8 rounded-xl transition-all flex items-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Save Cohort ({previewResult.shopper_count.toLocaleString()} shoppers)
                  </button>
                )}
              </div>
              
              {/* Preview Results */}
              {previewResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-6 bg-orange-500/10 border border-orange-500/20 rounded-xl"
                >
                  <h3 className="text-lg font-semibold text-white mb-2">Cohort Preview</h3>
                  <p className="text-3xl font-bold text-orange-400 mb-2">
                    {previewResult.shopper_count.toLocaleString()} shoppers
                  </p>
                  <p className="text-sm text-slate-400">
                    Sample IDs: {previewResult.sample_shoppers.slice(0, 5).join(', ')}
                    {previewResult.sample_shoppers.length > 5 && '...'}
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
        
        {activeTab === 'segment' && (
          <motion.div
            key="segment"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Build Your Segmentation */}
            <div className="glass-card rounded-2xl p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shapes className="w-5 h-5 text-orange-400" />
                  Build Your Segmentation
                </h2>
                <SavedPresets
                  reportType="shopper_cohorts"
                  currentParams={getCurrentParams()}
                  onLoadPreset={loadPreset}
                />
              </div>
              
              <div className="text-lg text-slate-300 leading-relaxed space-y-6">
                <p className="flex flex-wrap items-center gap-2">
                  <span>Segment shoppers based on</span>
                  <select
                    value={cohortType}
                    onChange={(e) => setCohortType(e.target.value)}
                    className="madlib-select bg-transparent border-b-2 border-orange-400 px-3 py-1 text-orange-300 font-medium cursor-pointer focus:outline-none"
                  >
                    <option value="frequency">shopping frequency</option>
                    <option value="monetary">total spend</option>
                    <option value="recency">recency of visit</option>
                    <option value="category_affinity">favorite category</option>
                  </select>
                </p>
                
                <p className="text-slate-400 text-base italic">
                  → Grouping shoppers by {cohortDescriptions[cohortType]}
                </p>
                
                <p className="flex flex-wrap items-center gap-2">
                  <Calendar className="w-5 h-5 text-slate-500" />
                  <span>analyzing behavior from</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setDatesTouched(true); setStartDate(e.target.value); }}
                    className="madlib-select bg-transparent border-b-2 border-pink-400 px-3 py-1 text-pink-300 font-medium cursor-pointer focus:outline-none"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setDatesTouched(true); setEndDate(e.target.value); }}
                    className="madlib-select bg-transparent border-b-2 border-pink-400 px-3 py-1 text-pink-300 font-medium cursor-pointer focus:outline-none"
                  />
                </p>
                
                {cohortType !== 'category_affinity' && (
                  <p className="flex flex-wrap items-center gap-2">
                    <span>dividing into</span>
                    <select
                      value={numSegments}
                      onChange={(e) => setNumSegments(parseInt(e.target.value))}
                      className="madlib-select bg-transparent border-b-2 border-cyan-400 px-3 py-1 text-cyan-300 font-medium cursor-pointer focus:outline-none"
                    >
                      <option value={3}>3 segments</option>
                      <option value={4}>4 segments</option>
                      <option value={5}>5 segments</option>
                      <option value={6}>6 segments</option>
                      <option value={10}>10 segments</option>
                    </select>
                  </p>
                )}
              </div>
              
              <div className="mt-8 pt-6 border-t border-white/10">
                <button
                  onClick={runAnalysis}
                  disabled={loading}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-orange-600 hover:to-red-600 transition-all duration-200 shadow-lg shadow-orange-500/25 flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                  Create Segments
                </button>
              </div>
            </div>
            
            {/* Results */}
            {results && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Segment Distribution</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={results.data.map((seg, i) => ({
                              name: getSegmentLabel(seg),
                              value: seg.SHOPPER_COUNT
                            }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {results.data.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.9)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '12px',
                              color: '#fff'
                            }}
                            formatter={(value) => [value.toLocaleString(), 'Shoppers']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 mt-4">
                      {results.data.map((seg, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                          />
                          <span className="text-sm text-slate-300">{getSegmentLabel(seg)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      {cohortType === 'frequency' && 'Average Visits'}
                      {cohortType === 'monetary' && 'Average Spend'}
                      {cohortType === 'recency' && 'Days Since Visit'}
                      {cohortType === 'category_affinity' && 'Average Category Spend'}
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          data={results.data.map((seg, i) => ({
                            name: getSegmentLabel(seg),
                            value: cohortType === 'frequency' ? seg.AVG_VISITS :
                                   cohortType === 'monetary' ? seg.AVG_SPEND :
                                   cohortType === 'recency' ? seg.AVG_DAYS_SINCE_VISIT :
                                   seg.AVG_CATEGORY_SPEND,
                            color: COLORS[i % COLORS.length]
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                          <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                          <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={100} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.9)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '12px',
                              color: '#fff'
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {results.data.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                
                {/* Segment Table with Save Buttons */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Segment Details</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left text-sm font-medium text-slate-400 pb-3">Segment</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Shoppers</th>
                          {cohortType === 'frequency' && (
                            <>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Avg Visits</th>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Range</th>
                            </>
                          )}
                          {cohortType === 'monetary' && (
                            <>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Avg Spend</th>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Range</th>
                            </>
                          )}
                          {cohortType === 'recency' && (
                            <>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Avg Days</th>
                              <th className="text-right text-sm font-medium text-slate-400 pb-3">Range</th>
                            </>
                          )}
                          {cohortType === 'category_affinity' && (
                            <th className="text-right text-sm font-medium text-slate-400 pb-3">Avg Spend</th>
                          )}
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.data.map((seg, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                />
                                <span className="text-white font-medium">{getSegmentLabel(seg)}</span>
                              </div>
                            </td>
                            <td className="py-3 text-right text-slate-300">{seg.SHOPPER_COUNT?.toLocaleString()}</td>
                            {cohortType === 'frequency' && (
                              <>
                                <td className="py-3 text-right text-retail-400 font-medium">{seg.AVG_VISITS}</td>
                                <td className="py-3 text-right text-slate-400 text-sm">{seg.MIN_VISITS} - {seg.MAX_VISITS}</td>
                              </>
                            )}
                            {cohortType === 'monetary' && (
                              <>
                                <td className="py-3 text-right text-retail-400 font-medium">${seg.AVG_SPEND?.toLocaleString()}</td>
                                <td className="py-3 text-right text-slate-400 text-sm">${seg.MIN_SPEND?.toLocaleString()} - ${seg.MAX_SPEND?.toLocaleString()}</td>
                              </>
                            )}
                            {cohortType === 'recency' && (
                              <>
                                <td className="py-3 text-right text-retail-400 font-medium">{seg.AVG_DAYS_SINCE_VISIT} days</td>
                                <td className="py-3 text-right text-slate-400 text-sm">{seg.MIN_DAYS} - {seg.MAX_DAYS} days</td>
                              </>
                            )}
                            {cohortType === 'category_affinity' && (
                              <td className="py-3 text-right text-retail-400 font-medium">${seg.AVG_CATEGORY_SPEND?.toLocaleString()}</td>
                            )}
                            <td className="py-3 text-right">
                              <button
                                onClick={() => saveSegment(seg, i)}
                                disabled={savingSegment === i}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                  segmentSaveSuccess === i
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-retail-500/20 hover:bg-retail-500/30 text-retail-300'
                                }`}
                              >
                                {savingSegment === i ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : segmentSaveSuccess === i ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                {segmentSaveSuccess === i ? 'Saved!' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
        
        {activeTab === 'expand' && (
          <motion.div
            key="expand"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Expand Your Cohort */}
            <div className="glass-card rounded-2xl p-8 mb-8">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Expand Your Cohort with Lookalikes
              </h2>
              
              <p className="text-slate-400 mb-6">
                Select a seed cohort and find similar shoppers based on their purchasing behavior, 
                category preferences, and spending patterns.
              </p>
              
              <div className="space-y-6">
                {/* Seed Cohort Selection */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-white/5 rounded-xl">
                  <Target className="w-5 h-5 text-purple-400" />
                  <span className="text-slate-300">Start with cohort:</span>
                  <select
                    value={selectedSeedCohort}
                    onChange={(e) => {
                      setSelectedSeedCohort(e.target.value);
                      setExpansionResult(null);
                    }}
                    className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-purple-300 font-medium min-w-[200px]"
                  >
                    <option value="">Select a cohort...</option>
                    {cohorts?.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.shopper_count?.toLocaleString() || '0'} shoppers)
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Expansion Parameters */}
                <div className="flex flex-wrap items-center gap-3 p-4 bg-white/5 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  <span className="text-slate-300">Expand audience by</span>
                  <select
                    value={expansionFactor}
                    onChange={(e) => setExpansionFactor(parseFloat(e.target.value))}
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-cyan-300 font-medium"
                  >
                    <option value={1.5}>1.5x</option>
                    <option value={2.0}>2x</option>
                    <option value={3.0}>3x</option>
                    <option value={5.0}>5x</option>
                    <option value={10.0}>10x</option>
                  </select>
                  <span className="text-slate-300">up to</span>
                  <select
                    value={maxAudienceSize}
                    onChange={(e) => setMaxAudienceSize(parseInt(e.target.value))}
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-amber-300 font-medium"
                  >
                    <option value={1000}>1,000</option>
                    <option value={5000}>5,000</option>
                    <option value={10000}>10,000</option>
                    <option value={25000}>25,000</option>
                    <option value={50000}>50,000</option>
                  </select>
                  <span className="text-slate-300">new lookalikes</span>
                </div>
                
                {/* Feature Weights Info */}
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                  <h4 className="text-sm font-medium text-purple-300 mb-2">Similarity Features Used:</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-200">Category Affinity (35%)</span>
                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-200">Brand Preference (25%)</span>
                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-200">Shopping Frequency (20%)</span>
                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-200">Spend Level (20%)</span>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-4">
                <button
                  onClick={previewExpansion}
                  disabled={expansionLoading || !selectedSeedCohort}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg shadow-purple-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {expansionLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Expand className="w-5 h-5" />
                  )}
                  Find Lookalikes
                </button>
              </div>
            </div>
            
            {/* Expansion Results */}
            {expansionResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="glass-card rounded-2xl p-6">
                    <div className="text-sm text-slate-400 mb-1">Seed Cohort</div>
                    <div className="text-2xl font-bold text-purple-400">
                      {expansionResult.seed_cohort.shopper_count.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{expansionResult.seed_cohort.name}</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="text-sm text-slate-400 mb-1">Target Lookalikes</div>
                    <div className="text-2xl font-bold text-slate-400">
                      {expansionResult.expansion_params.target_size.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">requested ({expansionFactor}x expansion)</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="text-sm text-slate-400 mb-1">New Lookalikes</div>
                    <div className="text-2xl font-bold text-cyan-400">
                      +{expansionResult.lookalike_count.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {expansionResult.lookalike_count < expansionResult.expansion_params.target_size 
                        ? `of ${expansionResult.total_candidates_available?.toLocaleString() || '?'} candidates`
                        : 'similar shoppers found'}
                    </div>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="text-sm text-slate-400 mb-1">Total Expanded</div>
                    <div className="text-2xl font-bold text-green-400">
                      {expansionResult.total_expanded_audience.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">combined audience</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6">
                    <div className="text-sm text-slate-400 mb-1">Avg Similarity</div>
                    <div className="text-2xl font-bold text-amber-400">
                      {(expansionResult.score_distribution.avg * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Range: {(expansionResult.score_distribution.min * 100).toFixed(0)}% - {(expansionResult.score_distribution.max * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                
                {/* Show note if fewer lookalikes than requested */}
                {expansionResult.lookalike_count < expansionResult.expansion_params.target_size && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-sm text-amber-300">
                      <strong>Note:</strong> Found {expansionResult.lookalike_count.toLocaleString()} lookalikes 
                      out of {expansionResult.expansion_params.target_size.toLocaleString()} requested.
                      {expansionResult.total_candidates_available && (
                        <> There were {expansionResult.total_candidates_available.toLocaleString()} total 
                        candidate shoppers available, but only {expansionResult.lookalike_count.toLocaleString()} met 
                        the similarity criteria.</>
                      )}
                    </p>
                  </div>
                )}
                
                {/* Score Distribution Chart */}
                <div className="glass-card rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Lookalike Score Breakdown (Top 100)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={expansionResult.lookalike_shoppers.slice(0, 50).map((s, i) => ({
                          index: i + 1,
                          similarity: (s.similarity_score * 100).toFixed(1),
                          category: (s.category_score * 100).toFixed(1),
                          brand: (s.brand_score * 100).toFixed(1),
                          frequency: (s.frequency_score * 100).toFixed(1),
                          spend: (s.spend_score * 100).toFixed(1)
                        }))}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="index" stroke="#94a3b8" fontSize={10} tick={false} label={{ value: 'Lookalike Rank', position: 'bottom', fill: '#94a3b8', fontSize: 12 }} />
                        <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} label={{ value: 'Score %', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            color: '#fff'
                          }}
                          formatter={(value, name) => [`${value}%`, name]}
                        />
                        <Bar dataKey="similarity" fill="#a855f7" name="Overall Similarity" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Score Legend */}
                  <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span>Overall Similarity Score</span>
                    </div>
                  </div>
                </div>
                
                {/* Sample Lookalikes Table */}
                <div className="glass-card rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Top Lookalike Shoppers</h3>
                    <button
                      onClick={() => setShowExpansionSaveModal(true)}
                      className="bg-retail-500/20 hover:bg-retail-500/30 border border-retail-500/30 text-retail-300 font-semibold py-2 px-6 rounded-xl transition-all flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Expanded Cohort
                    </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left text-sm font-medium text-slate-400 pb-3">Rank</th>
                          <th className="text-left text-sm font-medium text-slate-400 pb-3">Shopper ID</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Overall</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Category</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Brand</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Frequency</th>
                          <th className="text-right text-sm font-medium text-slate-400 pb-3">Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expansionResult.lookalike_shoppers.slice(0, 20).map((shopper, i) => (
                          <tr key={shopper.shopper_id} className="border-b border-white/5">
                            <td className="py-3 text-slate-400">#{i + 1}</td>
                            <td className="py-3 text-white font-mono text-sm">{shopper.shopper_id}</td>
                            <td className="py-3 text-right">
                              <span className={`px-2 py-1 rounded-lg text-sm font-medium ${
                                shopper.similarity_score >= 0.7 ? 'bg-green-500/20 text-green-400' :
                                shopper.similarity_score >= 0.5 ? 'bg-amber-500/20 text-amber-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {(shopper.similarity_score * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 text-right text-purple-300">{(shopper.category_score * 100).toFixed(0)}%</td>
                            <td className="py-3 text-right text-cyan-300">{(shopper.brand_score * 100).toFixed(0)}%</td>
                            <td className="py-3 text-right text-amber-300">{(shopper.frequency_score * 100).toFixed(0)}%</td>
                            <td className="py-3 text-right text-pink-300">{(shopper.spend_score * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {expansionResult.lookalike_shoppers.length > 20 && (
                    <p className="text-sm text-slate-500 mt-4 text-center">
                      Showing top 20 of {expansionResult.lookalike_count.toLocaleString()} lookalikes
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Save Cohort Modal */}
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
                  Save Cohort
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
                  <span className="text-lg font-medium">Cohort Saved!</span>
                </div>
              ) : (
                <>
                  <p className="text-slate-400 text-sm mb-4">
                    This will save {previewResult?.shopper_count.toLocaleString()} shoppers to your cohort.
                  </p>
                  
                  <input
                    type="text"
                    value={cohortName}
                    onChange={(e) => setCohortName(e.target.value)}
                    placeholder="Enter cohort name..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveCohort()}
                  />
                  
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowSaveModal(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveCohort}
                      disabled={!cohortName.trim() || savingCohort}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {savingCohort && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Cohort
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Save Expansion Modal */}
      <AnimatePresence>
        {showExpansionSaveModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setShowExpansionSaveModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-display font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  Save Expanded Cohort
                </h3>
                <button
                  onClick={() => setShowExpansionSaveModal(false)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {expansionSaveSuccess ? (
                <div className="flex items-center justify-center gap-2 py-8 text-green-400">
                  <Check className="w-6 h-6" />
                  <span className="text-lg font-medium">Expanded Cohort Saved!</span>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-slate-400">Seed Cohort</div>
                        <div className="text-white font-medium">{expansionResult?.seed_cohort.name}</div>
                        <div className="text-purple-300">{expansionResult?.seed_cohort.shopper_count.toLocaleString()} shoppers</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Lookalikes Added</div>
                        <div className="text-cyan-300 font-medium">+{expansionResult?.lookalike_count.toLocaleString()}</div>
                        <div className="text-green-300 font-medium">{expansionResult?.total_expanded_audience.toLocaleString()} total</div>
                      </div>
                    </div>
                  </div>
                  
                  <input
                    type="text"
                    value={expansionCohortName}
                    onChange={(e) => setExpansionCohortName(e.target.value)}
                    placeholder="Enter expanded cohort name..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && saveExpandedCohort()}
                  />
                  
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowExpansionSaveModal(false)}
                      className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveExpandedCohort}
                      disabled={!expansionCohortName.trim() || savingExpansion}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {savingExpansion && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Expanded Cohort
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
