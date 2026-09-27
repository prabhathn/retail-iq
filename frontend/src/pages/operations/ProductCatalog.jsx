import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Search, Filter, ChevronLeft, ChevronRight, 
  Edit2, Eye, X, Check, Loader2, Clock, CheckCircle, 
  XCircle, AlertCircle, RefreshCw, ChevronDown, Send
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { useFilters } from '../../contexts/FiltersContext';
import { trackPageView, trackObjectCreate, trackObjectModify, OBJECT_TYPES } from '../../services/tracking';

// Status badge styles for edit requests
const EDIT_STATUS_STYLES = {
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/30', icon: Clock },
  in_review: { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30', icon: Eye },
  approved: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30', icon: CheckCircle },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30', icon: XCircle },
  applied: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30', icon: Check },
};

export default function ProductCatalog() {
  // Use shared filter context (cached categories, brands, subcategories)
  const { categories, brands, subcategories, fetchFilters, filtersLoading } = useFilters();
  
  // View state
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'edit' | 'my_edits'
  
  // Product list state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 50,
    total_count: 0,
    total_pages: 0
  });
  
  // Filter state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sortBy, setSortBy] = useState('product_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showFilters, setShowFilters] = useState(false);
  
  // Selected product state
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({});
  const [editReason, setEditReason] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  
  // My edits state
  const [myEdits, setMyEdits] = useState([]);
  const [editsLoading, setEditsLoading] = useState(false);
  const [simulatingReview, setSimulatingReview] = useState(null);

  // Initial load - use shared cached filters
  useEffect(() => {
    trackPageView('/operations/product-catalog', 'Product Catalog');
    // Fetch filters if not already cached (will use cache if available)
    fetchFilters();
  }, [fetchFilters]);

  // Load products when filters change
  useEffect(() => {
    loadProducts();
  }, [pagination.page, search, categoryFilter, brandFilter, sortBy, sortOrder]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        page_size: pagination.page_size,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      if (brandFilter) params.append('brand', brandFilter);
      
      const response = await api.get(`/operations/assortment?${params}`);
      setProducts(response.data.products || []);
      setPagination(prev => ({
        ...prev,
        ...response.data.pagination
      }));
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyEdits = async () => {
    try {
      setEditsLoading(true);
      const response = await api.get('/operations/assortment/edits/my');
      setMyEdits(response.data.edits || []);
    } catch (error) {
      console.error('Failed to load edits:', error);
    } finally {
      setEditsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleViewDetail = async (product) => {
    try {
      const response = await api.get(`/operations/assortment/${product.UPC}`);
      setSelectedProduct(response.data.product);
      setView('detail');
    } catch (error) {
      console.error('Failed to load product detail:', error);
    }
  };

  const handleStartEdit = (product) => {
    setSelectedProduct(product);
    setEditFormData({
      upc: product.UPC || '',
      product_name: product.PRODUCT_NAME || '',
      brand: product.BRAND || '',
      category: product.CATEGORY || '',
      subcategory: product.SUBCATEGORY || '',
      price: product.PRICE || 0,
    });
    setEditReason('');
    setEditError(null);
    setView('edit');
  };

  const handleSubmitEdit = async () => {
    if (!selectedProduct) return;
    
    // Build changes object
    const changes = {};
    const original = selectedProduct;
    
    if (editFormData.upc !== original.UPC) {
      changes.upc = { old: original.UPC, new: editFormData.upc };
    }
    if (editFormData.product_name !== original.PRODUCT_NAME) {
      changes.product_name = { old: original.PRODUCT_NAME, new: editFormData.product_name };
    }
    if (editFormData.brand !== original.BRAND) {
      changes.brand = { old: original.BRAND, new: editFormData.brand };
    }
    if (editFormData.category !== original.CATEGORY) {
      changes.category = { old: original.CATEGORY, new: editFormData.category };
    }
    if (editFormData.subcategory !== original.SUBCATEGORY) {
      changes.subcategory = { old: original.SUBCATEGORY, new: editFormData.subcategory };
    }
    if (parseFloat(editFormData.price) !== parseFloat(original.PRICE)) {
      changes.price = { old: original.PRICE, new: parseFloat(editFormData.price) };
    }
    
    if (Object.keys(changes).length === 0) {
      setEditError('No changes detected');
      return;
    }
    
    try {
      setEditLoading(true);
      setEditError(null);
      
      await api.post(`/operations/assortment/${selectedProduct.UPC}/edit`, {
        upc: selectedProduct.UPC,
        changes,
        reason: editReason
      });
      
      trackObjectModify(OBJECT_TYPES.PRODUCT || 'product', selectedProduct.UPC, selectedProduct.PRODUCT_NAME, Object.keys(changes));
      
      setView('list');
      setSelectedProduct(null);
    } catch (error) {
      setEditError(extractErrorMessage(error, 'Failed to submit edit'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleSimulateReview = async (editId) => {
    try {
      setSimulatingReview(editId);
      await api.post(`/operations/assortment/edits/${editId}/simulate-review`);
      await loadMyEdits();
    } catch (error) {
      console.error('Failed to simulate review:', error);
    } finally {
      setSimulatingReview(null);
    }
  };

  const handleViewMyEdits = () => {
    loadMyEdits();
    setView('my_edits');
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setCategoryFilter('');
    setBrandFilter('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ChevronDown className="w-3 h-3 text-slate-500" />;
    return sortOrder === 'asc' 
      ? <ChevronDown className="w-3 h-3 text-cyan-400" />
      : <ChevronDown className="w-3 h-3 text-cyan-400 rotate-180" />;
  };

  // ============== VIEWS ==============

  if (view === 'my_edits') {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">My Edit Requests</h1>
              <p className="text-slate-400 text-sm">Track the status of your product edit submissions</p>
            </div>
          </div>
          <button
            onClick={loadMyEdits}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${editsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Demo Notice */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-200/70 text-sm">
            ⚠️ Demo mode: Approved edits will not actually modify product data in Snowflake.
          </p>
        </div>

        {/* Edits List */}
        {editsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : myEdits.length === 0 ? (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No edit requests found</p>
            <p className="text-slate-500 text-sm mt-1">Submit a product edit to see it here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myEdits.map((edit) => {
              const statusStyle = EDIT_STATUS_STYLES[edit.status] || EDIT_STATUS_STYLES.pending;
              const StatusIcon = statusStyle.icon;
              return (
                <motion.div
                  key={edit.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${statusStyle.bg} ${statusStyle.border} border`}>
                        <StatusIcon className={`w-5 h-5 ${statusStyle.text}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{edit.product_name}</span>
                          <span className="text-slate-500 text-sm">({edit.upc})</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${statusStyle.bg} ${statusStyle.text}`}>
                            {edit.status_info?.label || edit.status}
                          </span>
                          <span className="text-slate-500">
                            Submitted {new Date(edit.submitted_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {edit.status === 'pending' && (
                        <button
                          onClick={() => handleSimulateReview(edit.id)}
                          disabled={simulatingReview === edit.id}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg text-sm"
                        >
                          {simulatingReview === edit.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Simulate Review
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Changes summary */}
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="text-xs text-slate-500 mb-2">Changes:</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(edit.changes || {}).map(([field, values]) => (
                        <span key={field} className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">
                          <span className="text-slate-500">{field}:</span>{' '}
                          <span className="text-red-400 line-through">{String(values.old)}</span>{' '}
                          → <span className="text-green-400">{String(values.new)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* Review notes */}
                  {edit.reviewer_notes && (
                    <div className="mt-3 p-3 bg-slate-900/50 rounded-lg">
                      <div className="text-xs text-slate-500 mb-1">Reviewer Notes:</div>
                      <p className="text-sm text-slate-300">{edit.reviewer_notes}</p>
                      {edit.rejection_reason && (
                        <p className="text-sm text-red-400 mt-1">Reason: {edit.rejection_reason}</p>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (view === 'edit' && selectedProduct) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView('detail')}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Product</h1>
            <p className="text-slate-400 text-sm">UPC: {selectedProduct.UPC}</p>
          </div>
        </div>

        {/* Demo Notice */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 font-medium">Demo Mode</p>
            <p className="text-amber-200/70 text-sm mt-1">
              This is a demo environment. Product edits will go through the approval workflow, 
              but no actual changes will be made to the product database.
            </p>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 space-y-5">
          {editError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-300">{editError}</span>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">UPC</label>
            <input
              type="text"
              value={editFormData.upc}
              onChange={(e) => setEditFormData(prev => ({ ...prev, upc: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            {editFormData.upc !== selectedProduct.UPC && (
              <p className="text-xs text-amber-400 mt-1">
                Original: {selectedProduct.UPC}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Product Name</label>
            <input
              type="text"
              value={editFormData.product_name}
              onChange={(e) => setEditFormData(prev => ({ ...prev, product_name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            {editFormData.product_name !== selectedProduct.PRODUCT_NAME && (
              <p className="text-xs text-amber-400 mt-1">
                Original: {selectedProduct.PRODUCT_NAME}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Brand</label>
              <input
                type="text"
                value={editFormData.brand}
                onChange={(e) => setEditFormData(prev => ({ ...prev, brand: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Price</label>
              <input
                type="number"
                step="0.01"
                value={editFormData.price}
                onChange={(e) => setEditFormData(prev => ({ ...prev, price: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
              <input
                type="text"
                value={editFormData.category}
                onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Subcategory</label>
              <input
                type="text"
                value={editFormData.subcategory}
                onChange={(e) => setEditFormData(prev => ({ ...prev, subcategory: e.target.value }))}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Reason for Change</label>
            <textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Explain why this change is needed..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
            <button
              onClick={() => setView('detail')}
              className="px-4 py-2 text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitEdit}
              disabled={editLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {editLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit for Review
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedProduct) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('list')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{selectedProduct.PRODUCT_NAME}</h1>
              <p className="text-slate-400 text-sm">UPC: {selectedProduct.UPC}</p>
            </div>
          </div>
          <button
            onClick={() => handleStartEdit(selectedProduct)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium"
          >
            <Edit2 className="w-4 h-4" />
            Edit Product
          </button>
        </div>

        {/* Product Details */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Brand</label>
              <p className="text-lg text-white mt-1">{selectedProduct.BRAND || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Price</label>
              <p className="text-lg text-white mt-1">{formatPrice(selectedProduct.PRICE)}</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Category</label>
              <p className="text-lg text-white mt-1">{selectedProduct.CATEGORY || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Subcategory</label>
              <p className="text-lg text-white mt-1">{selectedProduct.SUBCATEGORY || '-'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============== LIST VIEW ==============
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Package className="w-7 h-7 text-cyan-400" />
            Product Catalog
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage product information and submit changes for review
          </p>
        </div>
        <button
          onClick={handleViewMyEdits}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
        >
          <Clock className="w-4 h-4" />
          My Edit Requests
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 mb-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by product name, UPC, or brand..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium"
            >
              Search
            </button>
          </form>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
              showFilters || categoryFilter || brandFilter
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {(categoryFilter || brandFilter) && (
              <span className="px-1.5 py-0.5 bg-cyan-500 text-xs rounded-full text-white">
                {[categoryFilter, brandFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* Expanded filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-4 pt-4 mt-4 border-t border-slate-700/50">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">Category</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">Brand</label>
                  <select
                    value={brandFilter}
                    onChange={(e) => {
                      setBrandFilter(e.target.value);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm"
                  >
                    <option value="">All Brands</option>
                    {brands.map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-slate-400 hover:text-white text-sm mt-5"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-slate-400">
          Showing {((pagination.page - 1) * pagination.page_size) + 1} - {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count.toLocaleString()} products
        </span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Per page:</span>
          <select
            value={pagination.page_size}
            onChange={(e) => setPagination(prev => ({ ...prev, page_size: parseInt(e.target.value), page: 1 }))}
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No products found</p>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or filters</p>
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
                    <SortIcon column="upc" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('product_name')}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Product Name
                    <SortIcon column="product_name" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('brand')}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Brand
                    <SortIcon column="brand" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('category')}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Category
                    <SortIcon column="category" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('price')}
                  className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                >
                  <div className="flex items-center justify-end gap-1">
                    Price
                    <SortIcon column="price" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {products.map((product, idx) => (
                <motion.tr 
                  key={product.UPC}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
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
                  <td className="px-4 py-2.5 text-sm text-white text-right font-medium">
                    {formatPrice(product.PRICE)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleViewDetail(product)}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(product)}
                        className="p-1.5 rounded hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-300"
                        title="Edit Product"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={!pagination.has_prev}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <div className="flex items-center gap-1">
            {/* First page */}
            {pagination.page > 3 && (
              <>
                <button
                  onClick={() => handlePageChange(1)}
                  className="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  1
                </button>
                {pagination.page > 4 && <span className="px-2 text-slate-600">...</span>}
              </>
            )}
            
            {/* Page numbers around current */}
            {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
              let pageNum;
              if (pagination.total_pages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.total_pages - 2) {
                pageNum = pagination.total_pages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              
              if (pageNum < 1 || pageNum > pagination.total_pages) return null;
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    pageNum === pagination.page
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            {/* Last page */}
            {pagination.page < pagination.total_pages - 2 && (
              <>
                {pagination.page < pagination.total_pages - 3 && <span className="px-2 text-slate-600">...</span>}
                <button
                  onClick={() => handlePageChange(pagination.total_pages)}
                  className="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  {pagination.total_pages}
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={!pagination.has_next}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

