import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Play, Calendar, Search, Package, Loader2 } from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import SavedPresets from '../../components/SavedPresets';
import AdvancedOptions from '../../components/AdvancedOptions';
import { trackReportRun } from '../../services/tracking';
import { useAnalyticsPage } from '../../hooks/useAnalyticsPage';
import { formatPercent } from '../../utils/formatters';

export default function MarketBasket() {
  // Use shared analytics page hook (with 90 days default for market basket)
  const { 
    loading, setLoading,
    results, setResults,
    error, setError,
    startDate, setStartDate,
    endDate, setEndDate
  } = useAnalyticsPage({ defaultDaysBack: 90, fetchFiltersOnMount: false });
  
  // Product search state (specific to this report)
  const [products, setProducts] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Additional form state
  const [minSupport, setMinSupport] = useState(0.05);
  const [limit, setLimit] = useState(20);
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  
  const searchProducts = async () => {
    if (!productSearch || productSearch.length < 2) {
      setProducts([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      const response = await api.get(`/analytics/products?search=${encodeURIComponent(productSearch)}&limit=10`);
      setProducts(response.data.products || []);
    } catch (error) {
      console.error('Failed to search products:', error);
    } finally {
      setSearchLoading(false);
    }
  };
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchProducts();
    }
  };
  
  const runAnalysis = async () => {
    if (!selectedProduct) return;
    
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const params = {
        product_upc: selectedProduct.UPC,
        product_name: selectedProduct.PRODUCT_NAME,
        start_date: startDate,
        end_date: endDate,
        min_support: minSupport,
        limit: limit,
        cohort_id: selectedCohortId ? parseInt(selectedCohortId) : null
      };
      
      trackReportRun('market_basket', params);
      
      const response = await api.post('/analytics/market-basket', params);
      console.log('Market Basket API Response:', response.data);
      setResults(response.data);
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(extractErrorMessage(err, 'Analysis failed'));
    } finally {
      setLoading(false);
    }
  };
  
  const getCurrentParams = () => ({
    productSearch,
    selectedProduct,
    startDate,
    endDate,
    minSupport,
    limit,
    selectedCohortId
  });
  
  const loadPreset = (params) => {
    if (params.productSearch) setProductSearch(params.productSearch);
    if (params.selectedProduct) setSelectedProduct(params.selectedProduct);
    if (params.startDate) setStartDate(params.startDate);
    if (params.endDate) setEndDate(params.endDate);
    if (params.minSupport) setMinSupport(params.minSupport);
    if (params.limit) setLimit(params.limit);
    if (params.selectedCohortId !== undefined) setSelectedCohortId(params.selectedCohortId);
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              Market Basket Analysis
            </h1>
            <p className="text-slate-400">
              Discover what products are purchased together
            </p>
          </div>
        </div>
      </motion.div>
      
      {/* Madlib Query Builder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-8 mb-8 relative z-10"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            Build Your Analysis
          </h2>
          <SavedPresets
            reportType="market_basket"
            currentParams={getCurrentParams()}
            onLoadPreset={loadPreset}
          />
        </div>
        
        <div className="text-lg text-slate-300 leading-relaxed space-y-6">
          {/* Line 1 - Product Selection */}
          <div className="space-y-3">
            <p className="flex items-center gap-2">
              <span>Show me what products are frequently purchased with</span>
            </p>
            
            {/* Product Search */}
            <div className="relative max-w-lg z-20">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setSelectedProduct(null);
                      setProducts([]);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Enter product name or UPC..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-slate-500 focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <button
                  onClick={searchProducts}
                  disabled={searchLoading || !productSearch || productSearch.length < 2}
                  className="px-5 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-xl text-purple-300 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {searchLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                  Search
                </button>
              </div>
              
              {/* Search Results Dropdown */}
              {products.length > 0 && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
                  {products.map((product) => (
                    <button
                      key={product.UPC}
                      onClick={() => {
                        setSelectedProduct(product);
                        setProductSearch(product.PRODUCT_NAME);
                        setProducts([]);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                    >
                      <div className="text-white font-medium">{product.PRODUCT_NAME}</div>
                      <div className="text-sm text-slate-400">
                        {product.BRAND} • {product.CATEGORY} • UPC: {product.UPC}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Selected Product Display */}
            {selectedProduct && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 max-w-md">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-purple-300 font-medium">{selectedProduct.PRODUCT_NAME}</div>
                    <div className="text-sm text-slate-400">
                      {selectedProduct.BRAND} • {selectedProduct.CATEGORY}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProduct(null);
                      setProductSearch('');
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Line 2 - Date Range */}
          <p className="flex flex-wrap items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-500" />
            <span>analyzing transactions from</span>
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
          
          {/* Line 3 - Parameters */}
          <p className="flex flex-wrap items-center gap-2">
            <span>showing products that appear in at least</span>
            <select
              value={minSupport}
              onChange={(e) => setMinSupport(parseFloat(e.target.value))}
              className="madlib-select bg-transparent border-b-2 border-amber-400 px-3 py-1 text-amber-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value={0.01}>1%</option>
              <option value={0.02}>2%</option>
              <option value={0.05}>5%</option>
              <option value={0.1}>10%</option>
              <option value={0.15}>15%</option>
              <option value={0.2}>20%</option>
            </select>
            <span>of baskets, limited to top</span>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="madlib-select bg-transparent border-b-2 border-cyan-400 px-3 py-1 text-cyan-300 font-medium cursor-pointer focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>products</span>
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
            disabled={loading || !selectedProduct}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-3 px-8 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg shadow-purple-500/25 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Find Related Products
          </button>
        </div>
      </motion.div>
      
      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-8"
        >
          <p className="text-red-400 font-medium">Error: {error}</p>
        </motion.div>
      )}
      
      {/* Results */}
      {results && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 relative z-0"
        >
          <h2 className="text-lg font-semibold text-white mb-2">
            Products Frequently Bought With
          </h2>
          <p className="text-purple-400 font-medium mb-6">
            {results.metadata?.target_product?.PRODUCT_NAME || selectedProduct?.PRODUCT_NAME || 'Selected Product'}
          </p>
          
          {results.data && results.data.length > 0 ? (
            <div className="grid gap-4">
              {results.data.map((item, index) => (
                <div 
                  key={item.UPC || index}
                  className="flex items-center gap-4 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-purple-300 font-bold text-sm">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{item.PRODUCT_NAME || 'Unknown Product'}</div>
                    <div className="text-sm text-slate-400">
                      {item.BRAND || 'Unknown'} • {item.CATEGORY || 'Unknown'}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-bold text-retail-400">
                      {formatPercent(item.SUPPORT_PCT)}
                    </div>
                    <div className="text-xs text-slate-400">
                      {Number(item.CO_OCCURRENCE_COUNT || 0).toLocaleString()} baskets
                    </div>
                  </div>
                  
                  {/* Visual bar */}
                  <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                      style={{ width: `${Math.min(Number(item.SUPPORT_PCT || 0) * 2, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              No co-purchased products found with the selected criteria.
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
