import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Users, Loader2, Settings2, Store, MapPin } from 'lucide-react';
import { useFilters } from '../contexts/FiltersContext';

/**
 * Collapsible Advanced Options section for analytics pages.
 * Contains cohort selection and other advanced filtering options.
 * 
 * @param {Object} props
 * @param {string|null} props.selectedCohortId - Currently selected cohort ID
 * @param {function} props.onCohortChange - Callback when cohort selection changes
 * @param {boolean} props.defaultExpanded - Whether to start expanded (default: false)
 * @param {boolean} props.showStoreFilter - Whether to show store/region filter (default: false)
 * @param {string} props.storeFilterType - 'all' | 'region' | 'store'
 * @param {function} props.onStoreFilterTypeChange - Callback when store filter type changes
 * @param {string} props.selectedRegion - Selected region value
 * @param {function} props.onRegionChange - Callback when region changes
 * @param {string} props.selectedStore - Selected store ID
 * @param {function} props.onStoreChange - Callback when store changes
 */
const AdvancedOptions = memo(function AdvancedOptions({
  selectedCohortId,
  onCohortChange,
  defaultExpanded = false,
  showStoreFilter = false,
  storeFilterType = 'all',
  onStoreFilterTypeChange,
  selectedRegion = '',
  onRegionChange,
  selectedStore = '',
  onStoreChange
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { cohorts, cohortsLoading, stores, storesLoading, fetchStores, filters, filtersLoading } = useFilters();
  
  // Fetch stores when store filter is shown
  useEffect(() => {
    if (showStoreFilter) {
      fetchStores();
    }
  }, [showStoreFilter, fetchStores]);
  
  const selectedCohort = cohorts.find(c => c.id === parseInt(selectedCohortId));
  const hasStoreFilter = showStoreFilter && storeFilterType !== 'all';
  
  return (
    <div className="border-t border-white/10 pt-6 mt-6">
      {/* Header - Clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full text-left group"
      >
        <Settings2 className="w-4 h-4" />
        <span className="text-sm font-medium">Advanced Options</span>
        {selectedCohortId && !isExpanded && (
          <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full ml-2">
            Cohort: {selectedCohort?.name || 'Selected'}
          </span>
        )}
        {hasStoreFilter && !isExpanded && (
          <span className="text-xs bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full ml-2">
            {storeFilterType === 'region' ? `Region: ${selectedRegion}` : `Store: ${selectedStore}`}
          </span>
        )}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>
      
      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-4">
              {/* Cohort Selection */}
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Filter by Shopper Cohort</span>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Limit analysis to shoppers in a specific cohort you've created.
                </p>
                
                {cohortsLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading cohorts...
                  </div>
                ) : cohorts.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    No cohorts available. Create one in{' '}
                    <a href="/analytics/shopper-cohorts" className="text-purple-400 hover:text-purple-300">
                      Shopper Cohorts
                    </a>.
                  </div>
                ) : (
                  <select
                    value={selectedCohortId || ''}
                    onChange={(e) => onCohortChange(e.target.value || null)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500/50 focus:outline-none transition-colors"
                  >
                    <option value="">All Shoppers (No cohort filter)</option>
                    {cohorts.map(cohort => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.name} ({cohort.shopper_count?.toLocaleString() || 0} shoppers)
                      </option>
                    ))}
                  </select>
                )}
                
                {/* Selected cohort info */}
                {selectedCohort && (
                  <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-purple-300">{selectedCohort.name}</div>
                        <div className="text-xs text-slate-400">
                          {selectedCohort.shopper_count?.toLocaleString() || 0} shoppers • 
                          {selectedCohort.cohort_type === 'custom' ? ' Custom cohort' : ' Segmentation'}
                        </div>
                      </div>
                      <button
                        onClick={() => onCohortChange(null)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Store/Region Filter - Optional */}
              {showStoreFilter && (
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Store className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-medium text-white">Filter by Location</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Limit analysis to a specific region or store.
                  </p>
                  
                  {/* Location type selector */}
                  <select
                    value={storeFilterType}
                    onChange={(e) => onStoreFilterTypeChange(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-teal-500/50 focus:outline-none transition-colors mb-3"
                  >
                    <option value="all">All Locations</option>
                    <option value="region">Specific Region</option>
                    <option value="store">Specific Store</option>
                  </select>
                  
                  {/* Region selector */}
                  {storeFilterType === 'region' && (
                    <div className="mt-3">
                      {filtersLoading ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading regions...
                        </div>
                      ) : (
                        <select
                          value={selectedRegion}
                          onChange={(e) => onRegionChange(e.target.value)}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-teal-500/50 focus:outline-none transition-colors"
                        >
                          <option value="">Select a region...</option>
                          {(filters?.regions || []).map(region => (
                            <option key={region} value={region}>{region}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  
                  {/* Store selector */}
                  {storeFilterType === 'store' && (
                    <div className="mt-3">
                      {storesLoading ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading stores...
                        </div>
                      ) : (
                        <select
                          value={selectedStore}
                          onChange={(e) => onStoreChange(e.target.value)}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-teal-500/50 focus:outline-none transition-colors"
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
                  )}
                  
                  {/* Selected location info */}
                  {storeFilterType !== 'all' && (selectedRegion || selectedStore) && (
                    <div className="mt-3 p-3 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {storeFilterType === 'region' ? (
                            <MapPin className="w-4 h-4 text-teal-400" />
                          ) : (
                            <Store className="w-4 h-4 text-teal-400" />
                          )}
                          <span className="text-sm font-medium text-teal-300">
                            {storeFilterType === 'region' ? selectedRegion : stores.find(s => s.STORE_ID === selectedStore)?.STORE_NAME || selectedStore}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            onStoreFilterTypeChange('all');
                            onRegionChange('');
                            onStoreChange('');
                          }}
                          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default AdvancedOptions;

