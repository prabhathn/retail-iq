import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarClock, RefreshCw, Loader2, AlertCircle, Check,
  TrendingUp, Database, Play, Info
} from 'lucide-react';
import api, { extractErrorMessage } from '../../services/api';
import { useDateAnchor } from '../../contexts/DateAnchorContext';

/**
 * DataWindowPanel
 *
 * Read-only view of the app's date coverage, plus the one action that matters:
 * topping the dataset up so it reaches today again.
 *
 * Context: the synthetic dataset is generated relative to whenever it was loaded.
 * RetailIQ derives its reference date from MAX(transaction_date) rather than the
 * wall clock, so relative windows keep working as the data ages - but eventually
 * you want the data itself to reach today. This panel shows the gap and closes it.
 *
 * There is deliberately no "set a fixed date" control. The reference date is
 * always derived from the data, so there is nothing to configure and nothing to
 * forget to reset.
 */
export default function DataWindowPanel() {
  const { refresh: refreshAnchor } = useDateAnchor();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);

  const pollRef = useRef(null);

  const loadStatus = async () => {
    try {
      const res = await api.get('/admin/data-window/status');
      setStatus(res.data);
      if (res.data.active_job_id) {
        startPolling(res.data.active_job_id);
      } else if (res.data.last_job) {
        setJob(res.data.last_job);
      }
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load data window status'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    return () => pollRef.current && clearInterval(pollRef.current);
  }, []);

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/admin/data-window/jobs/${jobId}`);
        setJob(res.data);
        if (!['pending', 'running'].includes(res.data.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          // The anchor cache was invalidated server-side; pull the new value so
          // the rest of the UI immediately reflects the extended data.
          await refreshAnchor();
          await loadStatus();
          if (res.data.status === 'success') {
            setNotice(
              `Added ${res.data.days_added} day(s): ` +
              `${(res.data.transactions_added || 0).toLocaleString()} transactions, ` +
              `${(res.data.items_added || 0).toLocaleString()} line items. ` +
              `Data now reaches ${res.data.new_data_max_date}.`
            );
          } else if (res.data.status === 'noop') {
            setNotice('Data already reaches the target date; nothing to add.');
          } else {
            setError(res.data.error || 'Top-up failed');
          }
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
      }
    }, 2000);
  };

  const handleRefreshProbe = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/admin/data-window/refresh');
      await refreshAnchor();
      await loadStatus();
      setNotice('Reference date re-checked against the warehouse.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Refresh failed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    try {
      const res = await api.post('/admin/data-window/extend?dry_run=true');
      setPreview(res.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Preview failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleExtend = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post('/admin/data-window/extend');
      setPreview(null);
      setJob({ id: res.data.job_id, status: 'pending', progress_pct: 0, progress_stage: 'queued' });
      startPolling(res.data.job_id);
    } catch (err) {
      setBusy(false);
      setError(extractErrorMessage(err, 'Failed to start top-up'));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  const gap = status?.gap_days;
  const stale = Boolean(status?.using_data_date);
  const jobRunning = job && ['pending', 'running'].includes(job.status);

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="p-4 bg-slate-800/40 border border-slate-700 rounded-lg flex gap-3 text-sm text-slate-300">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            RetailIQ treats the latest date in the data as "today". Every relative
            window &mdash; last 30 days, the 90-day cohort windows, 4-week store
            velocity &mdash; is measured back from that date, so reports stay
            populated even if the dataset has not been refreshed in a while.
          </p>
          <p className="text-slate-400">
            Nothing here needs configuring. Use <strong>Top up data</strong> when
            you want the dataset itself to reach the current date again.
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-300">
          <Check className="w-5 h-5 shrink-0" />
          <span className="text-sm">{notice}</span>
        </div>
      )}

      {/* Coverage cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-800/60 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
            <CalendarClock className="w-4 h-4" />
            Reference date
          </div>
          <div className="text-2xl font-semibold text-white">{status?.anchor_date || '-'}</div>
          <div className="text-xs text-slate-400 mt-1">
            {stale ? 'derived from the data' : 'data is current'}
          </div>
        </div>

        <div className="p-5 bg-slate-800/60 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
            <Database className="w-4 h-4" />
            Data coverage
          </div>
          <div className="text-sm font-medium text-white">
            {status?.data_min_date || '-'} &rarr; {status?.data_max_date || '-'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            last checked {status?.probed_at ? new Date(status.probed_at).toLocaleTimeString() : 'never'}
          </div>
        </div>

        <div className="p-5 bg-slate-800/60 border border-slate-700 rounded-xl">
          <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide mb-2">
            <TrendingUp className="w-4 h-4" />
            Behind today by
          </div>
          <div
            className={`text-2xl font-semibold ${
              gap === null || gap === undefined
                ? 'text-slate-400'
                : gap <= 1
                ? 'text-green-400'
                : gap <= 14
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {gap === null || gap === undefined ? '-' : `${gap} day${gap === 1 ? '' : 's'}`}
          </div>
          <div className="text-xs text-slate-400 mt-1">today is {status?.today}</div>
        </div>
      </div>

      {!status?.available && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-lg text-sm text-amber-300">
          The reference date could not be read from the warehouse, so the app is
          falling back to the real current date.
          {status?.error ? ` (${status.error})` : ''}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRefreshProbe}
          disabled={busy || jobRunning}
          className="px-4 py-2 text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy && !jobRunning ? 'animate-spin' : ''}`} />
          Re-check reference date
        </button>

        <button
          onClick={handlePreview}
          disabled={busy || jobRunning}
          className="px-4 py-2 text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 flex items-center gap-2 disabled:opacity-50"
        >
          Preview top-up
        </button>

        <button
          onClick={handleExtend}
          disabled={busy || jobRunning || gap === 0}
          title={gap === 0 ? 'Data already reaches today' : undefined}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 flex items-center gap-2 disabled:opacity-50"
        >
          {jobRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Top up data to today
        </button>
      </div>

      {/* Dry-run preview */}
      {preview && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-slate-800/60 border border-cyan-500/30 rounded-xl space-y-2 text-sm"
        >
          <div className="font-semibold text-white">Planned top-up</div>
          {preview.status === 'noop' ? (
            <div className="text-slate-300">{preview.message}</div>
          ) : (
            <ul className="text-slate-300 space-y-1">
              <li>Days to add: <span className="text-white">{preview.days_to_add}</span></li>
              <li>From <span className="text-white">{preview.first_new_date}</span> through <span className="text-white">{preview.target_date}</span></li>
              <li>
                Estimated rows:{' '}
                <span className="text-white">
                  ~{(preview.estimated_transactions || 0).toLocaleString()} transactions,{' '}
                  ~{(preview.estimated_items || 0).toLocaleString()} line items
                </span>
              </li>
              <li className="text-slate-400">
                New rows are appended and continue the existing ID sequence &mdash; existing data is not modified.
              </li>
            </ul>
          )}
        </motion.div>
      )}

      {/* Job progress / last run */}
      {job && (
        <div className="p-5 bg-slate-800/60 border border-slate-700 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-white text-sm">
              {jobRunning ? 'Top-up in progress' : 'Last top-up'}
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                job.status === 'success'
                  ? 'bg-green-500/20 text-green-300'
                  : job.status === 'failed'
                  ? 'bg-red-500/20 text-red-300'
                  : job.status === 'noop'
                  ? 'bg-slate-600/40 text-slate-300'
                  : 'bg-cyan-500/20 text-cyan-300'
              }`}
            >
              {job.status}
            </span>
          </div>

          {jobRunning && (
            <div className="space-y-1">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${job.progress_pct || 0}%` }}
                />
              </div>
              <div className="text-xs text-slate-400">
                {job.progress_stage}
                {job.progress_detail ? ` - ${job.progress_detail}` : ''} ({job.progress_pct || 0}%)
              </div>
            </div>
          )}

          {!jobRunning && job.status === 'success' && (
            <div className="text-sm text-slate-300">
              Added {job.days_added} day(s):{' '}
              {(job.transactions_added || 0).toLocaleString()} transactions,{' '}
              {(job.items_added || 0).toLocaleString()} line items. Data reaches{' '}
              <span className="text-white">{job.new_data_max_date}</span>.
            </div>
          )}
          {!jobRunning && job.status === 'failed' && (
            <div className="text-sm text-red-300">{job.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
