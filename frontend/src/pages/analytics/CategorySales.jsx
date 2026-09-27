import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, Play, Calendar, Layers, Tag, Barcode, Loader2, Link2 } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea } from 'recharts';
import api from '../../services/api';
import SavedPresets from '../../components/SavedPresets';
import FilterSelect from '../../components/FilterSelect';
import AdvancedOptions from '../../components/AdvancedOptions';
import { trackReportRun } from '../../services/tracking';
import { useAnalyticsPage } from '../../hooks/useAnalyticsPage';
import { formatCurrency, formatDate as formatDateUtil } from '../../utils/formatters';

export default function CategorySales() {
  // URL params for deep linking
  const [searchParams, setSearchParams] = useSearchParams();
  const hasLoadedUrlParams = useRef(false);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Use shared analytics page hook
  const { 
    filters, 
    filtersLoading,
    loading, setLoading,
    results, setResults,
    startDate, setStartDate,
    endDate, setEndDate
  } = useAnalyticsPage({ defaultDaysBack: 30 });
  
  // Form state specific to this report
  const [analysisType, setAnalysisType] = useState('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedUpc, setSelectedUpc] = useState('');
  const [groupBy, setGroupBy] = useState('day');
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  
  // Store filter (in advanced options)
  const [storeFilterType, setStoreFilterType] = useState('all'); // 'all', 'region', 'store'
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  
  // Load from URL params on mount (only once)
  useEffect(() => {
    if (hasLoadedUrlParams.current) return;
    
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const brand = searchParams.get('brand');
    const upc = searchParams.get('upc');
    const start = searchParams.get('startDate');
    const end = searchParams.get('endDate');
    const group = searchParams.get('groupBy');
    const cohort = searchParams.get('cohortId');
    const storeType = searchParams.get('storeFilterType');
    const region = searchParams.get('region');
    const store = searchParams.get('storeId');
    
    // Check if any URL params were provided
    if (type || category || brand || upc || start || end || group || cohort || storeType || region || store) {
      hasLoadedUrlParams.current = true;
      
      if (type && ['category', 'brand', 'upc'].includes(type)) {
        setAnalysisType(type);
      }
      if (category) setSelectedCategory(category);
      if (brand) setSelectedBrand(brand);
      if (upc) setSelectedUpc(upc);
      if (start) setStartDate(start);
      if (end) setEndDate(end);
      if (group && ['day', 'week', 'month'].includes(group)) {
        setGroupBy(group);
      }
      if (cohort) setSelectedCohortId(cohort);
      
      // Store filter params
      if (storeType && ['all', 'region', 'store'].includes(storeType)) {
        setStoreFilterType(storeType);
      }
      if (region) setSelectedRegion(region);
      if (store) {
        setStoreFilterType('store');
        setSelectedStore(store);
      }
    }
  }, [searchParams, setStartDate, setEndDate]);
  
  // Set defaults when filters load (only if no URL params)
  useEffect(() => {
    if (hasLoadedUrlParams.current) return;
    
    if (filters?.categories?.length > 0 && !selectedCategory) {
      setSelectedCategory(filters.categories[0]);
    }
    if (filters?.brands?.length > 0 && !selectedBrand) {
      setSelectedBrand(filters.brands[0]);
    }
  }, [filters, selectedCategory, selectedBrand]);
  
  // Generate shareable URL
  const generateShareableUrl = () => {
    const params = new URLSearchParams();
    params.set('type', analysisType);
    
    if (analysisType === 'category' && selectedCategory) {
      params.set('category', selectedCategory);
    } else if (analysisType === 'brand' && selectedBrand) {
      params.set('brand', selectedBrand);
    } else if (analysisType === 'upc' && selectedUpc) {
      params.set('upc', selectedUpc);
    }
    
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (groupBy) params.set('groupBy', groupBy);
    if (selectedCohortId) params.set('cohortId', selectedCohortId);
    
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  };
  
  const copyShareableLink = async () => {
    const url = generateShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };
  
  const runAnalysis = async () => {
    setLoading(true);
    try {
      const payload = {
        start_date: startDate,
        end_date: endDate,
        group_by: groupBy,
        cohort_id: selectedCohortId ? parseInt(selectedCohortId) : null,
      };
      
      if (analysisType === 'category') {
        payload.category = selectedCategory;
      } else if (analysisType === 'brand') {
        payload.brand = selectedBrand;
      } else {
        payload.upc = selectedUpc;
      }
      
      // Store filter (from advanced options)
      if (storeFilterType === 'region' && selectedRegion) {
        payload.region = selectedRegion;
      } else if (storeFilterType === 'store' && selectedStore) {
        payload.store_id = selectedStore;
      }
      
      trackReportRun('category_sales', payload);
      
      const response = await api.post('/analytics/category-sales', payload);
      setResults(response.data);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Use shared formatter with custom options for chart - memoized
  const formatChartDate = useCallback((dateStr) => formatDateUtil(dateStr, { includeYear: false }), []);
  const formatChartCurrency = useCallback((value) => formatCurrency(value, { compact: true }), []);
  
  // Memoize control limits from API response (calculated in Snowflake)
  const controlLimits = useMemo(() => {
    if (!results?.metadata?.control_limits) {
      return { mean: 0, ucl: 0, lcl: 0, stddev: 0 };
    }
    return results.metadata.control_limits;
  }, [results?.metadata?.control_limits]);
  
  // Memoize chart data transformation - expensive operation
  const chartData = useMemo(() => {
    if (!results?.data) return [];
    return results.data.map(d => ({
      ...d,
      period: formatChartDate(d.PERIOD),
      sales: d.TOTAL_SALES
    }));
  }, [results?.data, formatChartDate]);
  
  const getCurrentParams = () => ({
    analysisType,
    selectedCategory,
    selectedBrand,
    selectedUpc,
    startDate,
    endDate,
    groupBy,
    selectedCohortId,
    storeFilterType,
    selectedRegion,
    selectedStore
  });
  
  const loadPreset = (params) => {
    if (params.analysisType) setAnalysisType(params.analysisType);
    if (params.selectedCategory) setSelectedCategory(params.selectedCategory);
    if (params.selectedBrand) setSelectedBrand(params.selectedBrand);
    if (params.selectedUpc) setSelectedUpc(params.selectedUpc);
    if (params.startDate) setStartDate(params.startDate);
    if (params.endDate) setEndDate(params.endDate);
    if (params.groupBy) setGroupBy(params.groupBy);
    if (params.selectedCohortId !== undefined) setSelectedCohortId(params.selectedCohortId);
    if (params.storeFilterType) setStoreFilterType(params.storeFilterType);
    if (params.selectedRegion !== undefined) setSelectedRegion(params.selectedRegion);
    if (params.selectedStore !== undefined) setSelectedStore(params.selectedStore);
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Sales Analytics
            </h1>
            <p className="text-slate-400">
              Analyze sales trends by category, brand, or product
            </p>
          </div>
        </div>
      </motion.div>
      
      {/* Madlib Query Builder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-8 mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-retail-400" />
            Build Your Analysis
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={copyShareableLink}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
                linkCopied 
                  ? 'bg-green-500/20 border-green-500/30 text-green-300' 
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              }`}
              title="Copy shareable link with current selections"
            >
              <Link2 className="w-4 h-4" />
              <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
            </button>
            <SavedPresets
              reportType="category_sales"
              currentParams={getCurrentParams()}
              onLoadPreset={loadPreset}
            />
          </div>
        </div>
        
        <div className="text-lg text-slate-300 leading-relaxed space-y-6">
          {/* Line 1 - Analysis Type with inline value selector */}
          <p className="flex flex-wrap items-center gap-2">
            <span>Show me the sales for</span>
            <select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-retail-400 px-3 py-1 text-retail-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value="category">a category</option>
              <option value="brand">a brand</option>
              <option value="upc">a specific product</option>
            </select>
            {analysisType === 'category' && (
              <FilterSelect
                icon={Tag}
                label=":"
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={filters?.categories || []}
                loading={filtersLoading}
                colorClass="cyan"
              />
            )}
            {analysisType === 'brand' && (
              <FilterSelect
                icon={Tag}
                label=":"
                value={selectedBrand}
                onChange={setSelectedBrand}
                options={filters?.brands || []}
                loading={filtersLoading}
                colorClass="purple"
              />
            )}
            {analysisType === 'upc' && (
              <>
                <span>:</span>
                <input
                  type="text"
                  value={selectedUpc}
                  onChange={(e) => setSelectedUpc(e.target.value)}
                  placeholder="Enter UPC"
                  className="madlib-select bg-transparent border-b-2 border-orange-400 px-3 py-1 text-orange-300 font-medium focus:outline-none w-40"
                />
              </>
            )}
          </p>
          
          {/* Line 2 - Date Range */}
          <p className="flex flex-wrap items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-500" />
            <span>from</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-pink-400 px-3 py-1 text-pink-300 font-medium cursor-pointer focus:outline-none"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-pink-400 px-3 py-1 text-pink-300 font-medium cursor-pointer focus:outline-none"
            />
          </p>
          
          {/* Line 3 - Grouping */}
          <p className="flex flex-wrap items-center gap-2">
            <span>grouped by</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-amber-400 px-3 py-1 text-amber-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
            </select>
          </p>
        </div>
        
        {/* Advanced Options */}
        <AdvancedOptions
          selectedCohortId={selectedCohortId}
          onCohortChange={setSelectedCohortId}
          showStoreFilter={true}
          storeFilterType={storeFilterType}
          onStoreFilterTypeChange={setStoreFilterType}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          selectedStore={selectedStore}
          onStoreChange={setSelectedStore}
        />
        
        {/* Run Button */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 shadow-lg shadow-blue-500/25 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Run Analysis
          </button>
        </div>
      </motion.div>
      
      {/* Results */}
      {results && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8"
        >
          <h2 className="text-lg font-semibold text-white mb-6">
            Sales Results
          </h2>
          
          {results.data.length > 0 ? (
            <>
              {/* Control Chart Legend */}
              <div className="flex flex-wrap items-center gap-6 mb-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-green-500"></div>
                  <span className="text-slate-400">Mean: <span className="text-green-400 font-medium">{formatChartCurrency(controlLimits.mean)}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-amber-500 border-dashed"></div>
                  <span className="text-slate-400">UCL (+2σ): <span className="text-amber-400 font-medium">{formatChartCurrency(controlLimits.ucl)}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-amber-500 border-dashed"></div>
                  <span className="text-slate-400">LCL (-2σ): <span className="text-amber-400 font-medium">{formatChartCurrency(controlLimits.lcl)}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 bg-green-500/20 border border-green-500/30 rounded"></div>
                  <span className="text-slate-400">Expected Range</span>
                </div>
              </div>
              
              {/* Chart */}
              <div className="h-80 mb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    
                    {/* Control Zone Shading - Expected (green) */}
                    <ReferenceArea
                      y1={controlLimits.lcl}
                      y2={controlLimits.ucl}
                      fill="#22c55e"
                      fillOpacity={0.1}
                      stroke="#22c55e"
                      strokeOpacity={0.3}
                    />
                    
                    {/* Warning Zone Shading - Above UCL (red) */}
                    <ReferenceArea
                      y1={controlLimits.ucl}
                      y2={controlLimits.ucl + controlLimits.stddev}
                      fill="#ef4444"
                      fillOpacity={0.1}
                    />
                    
                    {/* Warning Zone Shading - Below LCL (red) */}
                    {controlLimits.lcl > 0 && (
                      <ReferenceArea
                        y1={Math.max(0, controlLimits.lcl - controlLimits.stddev)}
                        y2={controlLimits.lcl}
                        fill="#ef4444"
                        fillOpacity={0.1}
                      />
                    )}
                    
                    <XAxis 
                      dataKey="period" 
                      stroke="#94a3b8" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={12}
                      tickFormatter={formatChartCurrency}
                      tickLine={false}
                      domain={[
                        dataMin => Math.max(0, Math.min(dataMin, controlLimits.lcl) * 0.9),
                        dataMax => Math.max(dataMax, controlLimits.ucl) * 1.1
                      ]}
                    />
                    
                    {/* Upper Control Limit Line */}
                    <ReferenceLine
                      y={controlLimits.ucl}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      label={{
                        value: 'UCL',
                        position: 'right',
                        fill: '#f59e0b',
                        fontSize: 11
                      }}
                    />
                    
                    {/* Mean Line */}
                    <ReferenceLine
                      y={controlLimits.mean}
                      stroke="#22c55e"
                      strokeWidth={2}
                      label={{
                        value: 'Mean',
                        position: 'right',
                        fill: '#22c55e',
                        fontSize: 11
                      }}
                    />
                    
                    {/* Lower Control Limit Line */}
                    <ReferenceLine
                      y={controlLimits.lcl}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      label={{
                        value: 'LCL',
                        position: 'right',
                        fill: '#f59e0b',
                        fontSize: 11
                      }}
                    />
                    
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        color: '#fff'
                      }}
                      formatter={(value, name, props) => {
                        const isOutlier = value > controlLimits.ucl || value < controlLimits.lcl;
                        return [
                          <span style={{ color: isOutlier ? '#ef4444' : '#22c55e' }}>
                            ${value.toLocaleString()} {isOutlier ? '⚠️ Potential Outlier' : '✓ Expected'}
                          </span>,
                          'Sales'
                        ];
                      }}
                    />
                    
                    <Line 
                      type="monotone"
                      dataKey="sales" 
                      stroke="url(#salesGradient)"
                      strokeWidth={3}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const isOutlier = payload.sales > controlLimits.ucl || payload.sales < controlLimits.lcl;
                        return (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isOutlier ? 6 : 4}
                            fill={isOutlier ? '#ef4444' : '#3b82f6'}
                            stroke={isOutlier ? '#fca5a5' : '#93c5fd'}
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ fill: '#06b6d4', strokeWidth: 0, r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Period</th>
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Name</th>
                      <th className="text-right text-sm font-medium text-slate-400 pb-3">Units Sold</th>
                      <th className="text-right text-sm font-medium text-slate-400 pb-3">Total Sales</th>
                      <th className="text-right text-sm font-medium text-slate-400 pb-3">Transactions</th>
                      <th className="text-right text-sm font-medium text-slate-400 pb-3">Shoppers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.data.slice(0, 100).map((row, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-3 text-white">{formatChartDate(row.PERIOD)}</td>
                        <td className="py-3 text-slate-300">{row.GROUP_NAME}</td>
                        <td className="py-3 text-right text-slate-300">{row.UNITS_SOLD?.toLocaleString()}</td>
                        <td className="py-3 text-right text-retail-400 font-medium">${row.TOTAL_SALES?.toLocaleString()}</td>
                        <td className="py-3 text-right text-slate-300">{row.NUM_TRANSACTIONS?.toLocaleString()}</td>
                        <td className="py-3 text-right text-slate-300">{row.UNIQUE_SHOPPERS?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.data.length > 100 && (
                  <p className="text-center text-slate-400 text-sm mt-4 py-2 border-t border-white/5">
                    Showing first 100 of {results.data.length.toLocaleString()} rows
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400">
              No data found for the selected criteria.
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
