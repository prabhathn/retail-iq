import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Store, Play, Calendar, MapPin, TrendingUp, Loader2, Tag, Package, Barcode, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import SavedPresets from '../../components/SavedPresets';
import FilterSelect from '../../components/FilterSelect';
import AdvancedOptions from '../../components/AdvancedOptions';
import { trackReportRun } from '../../services/tracking';
import { useAnalyticsPage } from '../../hooks/useAnalyticsPage';
import { useFilters } from '../../contexts/FiltersContext';
import { formatMetricValue } from '../../utils/formatters';

const METRIC_LABELS = {
  sales: 'Total Sales',
  transactions: 'Transaction Count',
  basket_size: 'Average Basket Size'
};

export default function StorePerformance() {
  // Use shared analytics page hook
  const { 
    filters, 
    filtersLoading,
    loading, setLoading,
    results, setResults,
    startDate, setStartDate,
    endDate, setEndDate
  } = useAnalyticsPage({ defaultDaysBack: 30 });
  
  // Get stores from FiltersContext
  const { stores, storesLoading, fetchStores } = useFilters();
  
  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);
  
  // Form state specific to this report
  const [metric, setMetric] = useState('sales');
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  
  // Location filters (region or store)
  const [locationFilterType, setLocationFilterType] = useState('all'); // 'all', 'region', 'store'
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  
  // Product filters (follows same pattern as Sales Analytics)
  const [productFilterType, setProductFilterType] = useState('none'); // 'none', 'category', 'brand', 'upc'
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedUpc, setSelectedUpc] = useState('');
  
  const runAnalysis = async () => {
    setLoading(true);
    try {
      const payload = {
        start_date: startDate,
        end_date: endDate,
        metric: metric,
        cohort_id: selectedCohortId ? parseInt(selectedCohortId) : null
      };
      
      // Location filter (only send the selected type)
      if (locationFilterType === 'region' && selectedRegion) {
        payload.region = selectedRegion;
      } else if (locationFilterType === 'store' && selectedStore) {
        payload.store_ids = [selectedStore];
      }
      
      // Product filter (only send the selected type)
      if (productFilterType === 'category' && selectedCategory) {
        payload.category = selectedCategory;
      } else if (productFilterType === 'brand' && selectedBrand) {
        payload.brand = selectedBrand;
      } else if (productFilterType === 'upc' && selectedUpc) {
        payload.upc = selectedUpc;
      }
      
      trackReportRun('store_performance', payload);
      
      const response = await api.post('/analytics/store-performance', payload);
      setResults(response.data);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getCurrentParams = () => ({
    metric,
    startDate,
    endDate,
    selectedCohortId,
    locationFilterType,
    selectedRegion,
    selectedStore,
    productFilterType,
    selectedCategory,
    selectedBrand,
    selectedUpc
  });
  
  const loadPreset = (params) => {
    if (params.metric) setMetric(params.metric);
    if (params.startDate) setStartDate(params.startDate);
    if (params.endDate) setEndDate(params.endDate);
    if (params.selectedCohortId !== undefined) setSelectedCohortId(params.selectedCohortId);
    if (params.locationFilterType) setLocationFilterType(params.locationFilterType);
    if (params.selectedRegion !== undefined) setSelectedRegion(params.selectedRegion);
    if (params.selectedStore !== undefined) setSelectedStore(params.selectedStore);
    if (params.productFilterType) setProductFilterType(params.productFilterType);
    if (params.selectedCategory !== undefined) setSelectedCategory(params.selectedCategory);
    if (params.selectedBrand !== undefined) setSelectedBrand(params.selectedBrand);
    if (params.selectedUpc !== undefined) setSelectedUpc(params.selectedUpc);
  };
  
  // Memoize formatter to prevent recreation on every render
  const formatValue = useCallback((value) => formatMetricValue(value, metric), [metric]);
  
  // Memoize chart data transformation
  const chartData = useMemo(() => {
    if (!results?.data) return [];
    return results.data.map(store => ({
      name: store.STORE_NAME,
      value: store.METRIC_VALUE,
      region: store.REGION
    }));
  }, [results?.data]);
  
  
  const getRankMedal = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Store Performance
            </h1>
            <p className="text-slate-400">
              Compare performance across stores and regions
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
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Build Your Analysis
          </h2>
          <SavedPresets
            reportType="store_performance"
            currentParams={getCurrentParams()}
            onLoadPreset={loadPreset}
          />
        </div>
        
        <div className="text-lg text-slate-300 leading-relaxed space-y-6">
          {/* Line 1 - Metric Selection */}
          <p className="flex flex-wrap items-center gap-2">
            <span>Compare stores by their</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-emerald-400 px-3 py-1 text-emerald-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value="sales">total sales</option>
              <option value="transactions">number of transactions</option>
              <option value="basket_size">average basket size</option>
            </select>
          </p>
          
          {/* Line 2 - Location Filter */}
          <p className="flex flex-wrap items-center gap-2">
            <MapPin className="w-5 h-5 text-slate-500" />
            <span>in</span>
            <select
              value={locationFilterType}
              onChange={(e) => setLocationFilterType(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-cyan-400 px-3 py-1 text-cyan-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value="all">all locations</option>
              <option value="region">a specific region</option>
              <option value="store">a specific store</option>
            </select>
            {locationFilterType === 'region' && (
              <FilterSelect
                icon={MapPin}
                label=":"
                value={selectedRegion}
                onChange={setSelectedRegion}
                options={filters?.regions || []}
                loading={filtersLoading}
                colorClass="teal"
              />
            )}
            {locationFilterType === 'store' && (
              <>
                <span>:</span>
                {storesLoading ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1 text-orange-300 border-b-2 border-orange-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <select
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                    className="madlib-select bg-transparent border-b-2 border-orange-400 px-3 py-1 text-orange-300 font-medium cursor-pointer focus:outline-none max-w-xs"
                  >
                    <option value="">Select a store...</option>
                    {stores.map(store => (
                      <option key={store.STORE_ID} value={store.STORE_ID}>
                        {store.STORE_NAME} ({store.STORE_ID})
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </p>
          
          {/* Line 3 - Product Filter */}
          <p className="flex flex-wrap items-center gap-2">
            <Package className="w-5 h-5 text-slate-500" />
            <span>for</span>
            <select
              value={productFilterType}
              onChange={(e) => setProductFilterType(e.target.value)}
              className="madlib-select bg-transparent border-b-2 border-violet-400 px-3 py-1 text-violet-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value="none">all products</option>
              <option value="category">a category</option>
              <option value="brand">a brand</option>
              <option value="upc">a specific UPC</option>
            </select>
            {productFilterType === 'category' && (
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
            {productFilterType === 'brand' && (
              <FilterSelect
                icon={Package}
                label=":"
                value={selectedBrand}
                onChange={setSelectedBrand}
                options={filters?.brands || []}
                loading={filtersLoading}
                colorClass="amber"
              />
            )}
            {productFilterType === 'upc' && (
              <>
                <span>:</span>
                <input
                  type="text"
                  value={selectedUpc}
                  onChange={(e) => setSelectedUpc(e.target.value)}
                  placeholder="Enter UPC"
                  className="madlib-select bg-transparent border-b-2 border-rose-400 px-3 py-1 text-rose-300 font-medium focus:outline-none w-40"
                />
              </>
            )}
          </p>
          
          {/* Line 5 - Date Range */}
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
        </div>
        
        {/* Advanced Options */}
        <AdvancedOptions
          selectedCohortId={selectedCohortId}
          onCohortChange={setSelectedCohortId}
        />
        
        {/* Run Button */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all duration-200 shadow-lg shadow-emerald-500/25 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Compare Stores
          </button>
        </div>
      </motion.div>
      
      {/* Results */}
      {results && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Bar Chart */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {METRIC_LABELS[metric]} by Store
            </h3>
            <div style={{ height: Math.max(300, Math.min(chartData.length, 15) * 45) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={chartData.slice(0, 15)}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
                  <XAxis 
                    type="number" 
                    stroke="#94a3b8" 
                    fontSize={12}
                    tickFormatter={formatValue}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    width={120}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff'
                    }}
                    formatter={(value) => [formatValue(value), METRIC_LABELS[metric]]}
                    labelFormatter={(name) => `Store: ${name}`}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="url(#storeGradient)" 
                    radius={[0, 4, 4, 0]}
                  />
                  <defs>
                    <linearGradient id="storeGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Store Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.data.slice(0, 9).map((store, index) => (
              <div 
                key={store.STORE_ID}
                className="glass-card rounded-xl p-5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{getRankMedal(index)}</div>
                  <span className="text-xs bg-teal-500/20 text-teal-300 px-2 py-1 rounded-full">
                    {store.REGION}
                  </span>
                </div>
                
                <h4 className="text-white font-semibold mb-1">{store.STORE_NAME}</h4>
                <p className="text-xs text-slate-400 mb-3">ID: {store.STORE_ID}</p>
                
                <div className="text-2xl font-bold text-retail-400">
                  {formatValue(store.METRIC_VALUE)}
                </div>
                <p className="text-xs text-slate-400">{METRIC_LABELS[metric]}</p>
              </div>
            ))}
          </div>
          
          {/* Full Table */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">All Stores</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-sm font-medium text-slate-400 pb-3">Rank</th>
                    <th className="text-left text-sm font-medium text-slate-400 pb-3">Store</th>
                    <th className="text-left text-sm font-medium text-slate-400 pb-3">Region</th>
                    <th className="text-right text-sm font-medium text-slate-400 pb-3">{METRIC_LABELS[metric]}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.map((store, index) => (
                    <tr key={store.STORE_ID} className="border-b border-white/5">
                      <td className="py-3 text-slate-300">{index + 1}</td>
                      <td className="py-3">
                        <div className="text-white font-medium">{store.STORE_NAME}</div>
                        <div className="text-xs text-slate-500">{store.STORE_ID}</div>
                      </td>
                      <td className="py-3">
                        <span className="text-xs bg-white/10 text-slate-300 px-2 py-1 rounded-full">
                          {store.REGION}
                        </span>
                      </td>
                      <td className="py-3 text-right text-retail-400 font-semibold">
                        {formatValue(store.METRIC_VALUE)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
