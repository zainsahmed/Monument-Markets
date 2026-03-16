import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, AlertCircle, Database } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SignalCard from '../components/SignalCard';
import FilterBar from '../components/FilterBar';
import StatsPanel from '../components/StatsPanel';
import ExportMenu from '../components/ExportMenu';

const PAGE_SIZE = 20;
const DEFAULT_FILTERS = { sector: '', company: '', startDate: '', endDate: '', sort: 'newest' };

export default function Dashboard() {
  const { token } = useAuth();
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState(null);
  const isProduction = import.meta.env.PROD;

  const fetchSignals = useCallback(
    async (currentFilters, offset = 0, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const params = {
          limit: PAGE_SIZE,
          offset,
          sort: currentFilters.sort || 'newest',
        };
        if (currentFilters.sector) params.sector = currentFilters.sector;
        if (currentFilters.company) params.company = currentFilters.company;
        if (currentFilters.startDate) params.startDate = currentFilters.startDate;
        if (currentFilters.endDate) params.endDate = currentFilters.endDate;

        const data = await api.getSignals(token, params);

        if (append) {
          setSignals((prev) => [...prev, ...data.signals]);
        } else {
          setSignals(data.signals);
        }
        setPagination({
          total: data.pagination.total,
          hasMore: data.pagination.hasMore,
          offset: offset + PAGE_SIZE,
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load signals');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token]
  );

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getStats(token);
      setStats(data);
    } catch {
      // Stats are non-critical
    }
  }, [token]);

  useEffect(() => {
    fetchSignals(filters, 0, false);
    fetchStats();
  }, [filters, fetchSignals, fetchStats]);

  function handleFiltersChange(newFilters) {
    setFilters(newFilters);
  }

  function handleClearFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function handleLoadMore() {
    fetchSignals(filters, pagination.offset, true);
  }

  async function handleIngest() {
    setIngesting(true);
    setIngestMsg(null);
    try {
      await api.triggerIngestion();
      setIngestMsg('Ingestion started. New signals will appear shortly.');
      setTimeout(() => {
        fetchSignals(filters, 0, false);
        fetchStats();
      }, 3000);
    } catch (err) {
      setIngestMsg('Failed to trigger ingestion.');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Policy Signal Feed</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pagination.total > 0
              ? `${pagination.total.toLocaleString()} signals · Defense, Healthcare & Energy`
              : 'Real-time policy intelligence across Defense, Healthcare & Energy'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isProduction && (
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="btn-ghost text-xs flex items-center gap-1.5"
              title="Trigger data ingestion"
            >
              {ingesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              Ingest Data
            </button>
          )}
          <button
            onClick={() => { fetchSignals(filters, 0, false); fetchStats(); }}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <ExportMenu filters={filters} />
        </div>
      </div>

      {ingestMsg && (
        <div className="bg-blue-950 border border-blue-800 text-blue-300 text-sm px-4 py-3 rounded-lg">
          {ingestMsg}
        </div>
      )}

      {/* Stats panel */}
      {stats && <StatsPanel stats={stats} />}

      {/* Filters */}
      <FilterBar filters={filters} onChange={handleFiltersChange} onClear={handleClearFilters} />

      {/* Signal feed */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading signals...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">{error}</p>
            <button
              onClick={() => fetchSignals(filters, 0, false)}
              className="btn-secondary mt-4 text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      ) : signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-slate-300 font-medium mb-1">No signals found</h3>
          <p className="text-slate-500 text-sm max-w-sm">
            {Object.values(filters).some(Boolean)
              ? 'Try adjusting your filters or clear them to see all signals.'
              : !isProduction
              ? 'No signals yet. Click "Ingest Data" to pull policy data and generate signals.'
              : 'No signals generated yet. The system will automatically ingest data on schedule.'}
          </p>
          {!isProduction && (
            <button onClick={handleIngest} disabled={ingesting} className="btn-primary mt-4 text-sm">
              {ingesting ? 'Ingesting...' : 'Ingest Data Now'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>

          {pagination.hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${pagination.total - pagination.offset} remaining)`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
