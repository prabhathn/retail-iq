import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Filter, Clock, CheckCircle, XCircle, ChevronDown, Loader2 } from 'lucide-react';
import api from '../../services/api';

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    fetchReports();
  }, [filterType]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('report_type', filterType);
      params.append('limit', '100');
      
      const response = await api.get(`/admin/reports?${params.toString()}`);
      setReports(response.data.reports);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const reportTypes = ['category_sales', 'market_basket', 'shopper_cohorts', 'store_performance'];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-8 h-8 text-green-400" />
              <h1 className="text-2xl font-display font-bold text-white">Reports Run</h1>
            </div>
            <p className="text-slate-400">{total} total reports run</p>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              <option value="">All Types</option>
              {reportTypes.map(type => (
                <option key={type} value={type}>{type.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports List */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-sm font-medium text-slate-400 pb-3">Report</th>
                  <th className="text-left text-sm font-medium text-slate-400 pb-3">User</th>
                  <th className="text-right text-sm font-medium text-slate-400 pb-3">Rows</th>
                  <th className="text-right text-sm font-medium text-slate-400 pb-3">Time (ms)</th>
                  <th className="text-right text-sm font-medium text-slate-400 pb-3">Status</th>
                  <th className="text-right text-sm font-medium text-slate-400 pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
                      </div>
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No reports found
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr 
                      key={report.id} 
                      className={`border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${
                        selectedReport?.id === report.id ? 'bg-white/10' : ''
                      }`}
                      onClick={() => setSelectedReport(report)}
                    >
                      <td className="py-3">
                        <span className="text-white font-medium capitalize">
                          {report.report_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3">
                        <p className="text-slate-300">{report.user_name}</p>
                        <p className="text-xs text-slate-500">{report.user_email}</p>
                      </td>
                      <td className="py-3 text-right text-slate-300">{report.row_count?.toLocaleString() || '—'}</td>
                      <td className="py-3 text-right text-slate-300">{report.execution_time_ms?.toFixed(0) || '—'}</td>
                      <td className="py-3 text-right">
                        {report.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-green-400">
                            <CheckCircle className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-400 text-sm">{formatDate(report.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Report Detail Panel */}
        <div className="glass-card rounded-2xl p-6">
          {selectedReport ? (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 capitalize">
                {selectedReport.report_type.replace('_', ' ')}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400">Run by</label>
                  <p className="text-white">{selectedReport.user_name}</p>
                  <p className="text-xs text-slate-400">{selectedReport.user_email}</p>
                </div>
                
                <div>
                  <label className="text-sm text-slate-400">Date</label>
                  <p className="text-white">{formatDate(selectedReport.created_at)}</p>
                </div>
                
                <div>
                  <label className="text-sm text-slate-400">Status</label>
                  <p className={selectedReport.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                    {selectedReport.status}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm text-slate-400">Results</label>
                  <p className="text-white">{selectedReport.row_count?.toLocaleString() || 0} rows</p>
                </div>
                
                <div>
                  <label className="text-sm text-slate-400">Execution Time</label>
                  <p className="text-white">{selectedReport.execution_time_ms?.toFixed(2) || '—'} ms</p>
                </div>
                
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Parameters</label>
                  <pre className="bg-white/5 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-60">
                    {JSON.stringify(selectedReport.parameters, null, 2)}
                  </pre>
                </div>
                
                {selectedReport.error_message && (
                  <div>
                    <label className="text-sm text-red-400 mb-2 block">Error</label>
                    <pre className="bg-red-500/10 rounded-lg p-3 text-xs text-red-300 overflow-auto">
                      {selectedReport.error_message}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <FileText className="w-12 h-12 mb-2 opacity-50" />
              <p>Select a report to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

