import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Store, Package, TrendingUp, Loader2, Search, 
  ChevronDown, ArrowUpDown, Filter, BarChart3
} from 'lucide-react';
import api from '../../services/api';
import { useFilters } from '../../contexts/FiltersContext';
import { trackPageView } from '../../services/tracking';

export default function StoreAssortment() {
  const navigate = useNavigate();
  
  // Use cached stores and categories from FiltersContext
  const { categories, stores, storesLoading, fetchFilters, fetchStores } = useFilters();
  
  // Filter state
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Sorting
  const [sortBy, setSortBy] = useState('velocity');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load filters and stores on mount (uses cache if available)
  useEffect(() => {
    trackPageView('/operations/store-assortment', 'Store Assortment');
    fetchFilters();
    fetchStores();
  }, [fetchFilters, fetchStores]);

  // Load products when store or category changes
  useEffect(() => {
    if (selectedStore) {
      loadStoreAssortment();
    }
  }, [selectedStore, selectedCategory]);

  const loadStoreAssortment = async () => {
    if (!selectedStore) return;
    
    try {
      setLoading(true);
      const params = new URLSearchParams({
        store_id: selectedStore,
      });
      if (selectedCategory) {
        params.append('category', selectedCategory);
      }
      
      const response = await api.get(`/operations/store-assortment?${params}`);
      setProducts(response.data.products || []);
    } catch (error) {
      console.error('Failed to load store assortment:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'velocity' ? 'desc' : 'asc');
    }
  };

  // Filter and sort products
  const filteredProducts = products
    .filter(p => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        p.PRODUCT_NAME?.toLowerCase().includes(query) ||
        p.UPC?.toLowerCase().includes(query) ||
        p.BRAND?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortBy.toUpperCase()] || a[sortBy] || 0;
      const bVal = b[sortBy.toUpperCase()] || b[sortBy] || 0;
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

  const formatVelocity = (velocity) => {
    if (!velocity && velocity !== 0) return '-';
    return velocity.toFixed(1);
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const getVelocityColor = (velocity) => {
    if (!velocity) return 'text-slate-400';
    if (velocity >= 50) return 'text-green-400';
    if (velocity >= 20) return 'text-cyan-400';
    if (velocity >= 10) return 'text-amber-400';
    return 'text-red-400';
  };

  const selectedStoreData = stores.find(s => s.STORE_ID === selectedStore);

  // Navigate to Sales Analytics with store and UPC pre-filled
  const analyzeSales = (upc) => {
    const params = new URLSearchParams({
      type: 'upc',
      upc: upc,
      storeId: selectedStore,
    });
    navigate(`/analytics/category-sales?${params.toString()}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Store className="w-7 h-7 text-emerald-400" />
          Store Assortment
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          View product assortment and SKU velocity by store
        </p>
      </div>

      {/* Store & Category Selectors */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Store Selector */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block font-medium">Store</label>
            {storesLoading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg">
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                <span className="text-slate-400 text-sm">Loading stores...</span>
              </div>
            ) : (
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">Select a store...</option>
                {stores.map(store => (
                  <option key={store.STORE_ID} value={store.STORE_ID}>
                    {store.STORE_NAME} ({store.STORE_ID})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Category Selector */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block font-medium">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={!selectedStore}
              className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block font-medium">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                disabled={!selectedStore}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Store Info */}
        {selectedStoreData && (
          <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-400" />
              <span className="text-white font-medium">{selectedStoreData.STORE_NAME}</span>
            </div>
            <div className="text-sm text-slate-400">
              Region: <span className="text-slate-300">{selectedStoreData.REGION}</span>
            </div>
            <div className="text-sm text-slate-400">
              Type: <span className="text-slate-300">{selectedStoreData.STORE_TYPE}</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {!selectedStore ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
          <Store className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Select a Store</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            Choose a store from the dropdown above to view its product assortment and recent SKU velocity.
          </p>
        </div>
      ) : loading ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-slate-400">Loading store assortment...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Results Summary */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-slate-400 text-sm">
                {filteredProducts.length} products
                {selectedCategory && <span className="text-slate-500"> in {selectedCategory}</span>}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <TrendingUp className="w-3.5 h-3.5" />
              Velocity = Units sold per week (last 4 weeks)
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            {filteredProducts.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No products found</p>
                <p className="text-slate-500 text-sm mt-1">
                  {searchQuery ? 'Try adjusting your search' : 'This store may not have any products in this category'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-900/30">
                    <th 
                      onClick={() => handleSort('upc')}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center gap-1">
                        UPC
                        {sortBy === 'upc' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('product_name')}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center gap-1">
                        Product Name
                        {sortBy === 'product_name' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('brand')}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center gap-1">
                        Brand
                        {sortBy === 'brand' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('category')}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center gap-1">
                        Category
                        {sortBy === 'category' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('price')}
                      className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center justify-end gap-1">
                        Price
                        {sortBy === 'price' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('velocity')}
                      className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Velocity
                        {sortBy === 'velocity' && <ArrowUpDown className="w-3 h-3" />}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredProducts.map((product, idx) => (
                    <motion.tr 
                      key={product.UPC}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className="hover:bg-slate-700/20"
                    >
                      <td className="px-4 py-2.5 text-sm text-slate-300 font-mono">
                        {product.UPC}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-white max-w-xs truncate">
                        {product.PRODUCT_NAME}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-300">
                        {product.BRAND || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-400">
                        {product.CATEGORY || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-white text-right">
                        {formatPrice(product.PRICE)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-semibold ${getVelocityColor(product.VELOCITY)}`}>
                            {formatVelocity(product.VELOCITY)}
                          </span>
                          <span className="text-xs text-slate-500">units/wk</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => analyzeSales(product.UPC)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
                          title="Analyze sales for this product"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          Analyze
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Velocity Legend */}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs">
            <span className="text-slate-500">Velocity Rating:</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="text-green-400">High (50+)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-cyan-400">Medium (20-49)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-amber-400">Low (10-19)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              <span className="text-red-400">Very Low (&lt;10)</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

