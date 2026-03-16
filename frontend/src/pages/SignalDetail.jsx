import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  Building2,
  Loader2,
  AlertCircle,
  Clock,
  BarChart2,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';

const SECTOR_CONFIG = {
  defense: { label: 'Defense', color: '#3b82f6', bg: 'bg-blue-950', text: 'text-blue-300', border: 'border-blue-800' },
  healthcare: { label: 'Healthcare', color: '#10b981', bg: 'bg-emerald-950', text: 'text-emerald-300', border: 'border-emerald-800' },
  energy: { label: 'Energy', color: '#f59e0b', bg: 'bg-amber-950', text: 'text-amber-300', border: 'border-amber-800' },
};

function ScoreDisplay({ label, value, color }) {
  return (
    <div className="card p-4">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>
        {value}
        <span className="text-slate-600 text-base font-normal">/10</span>
      </p>
      <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value * 10}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function SignalDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSignal() {
      setLoading(true);
      try {
        const data = await api.getSignal(token, id);
        setSignal(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load signal');
      } finally {
        setLoading(false);
      }
    }
    fetchSignal();
  }, [id, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading signal...</span>
        </div>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-slate-300 font-medium mb-4">{error || 'Signal not found'}</p>
        <Link to="/" className="btn-secondary text-sm">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const config = SECTOR_CONFIG[signal.sector] || SECTOR_CONFIG.defense;
  const companies = Array.isArray(signal.affected_companies) ? signal.affected_companies : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back navigation */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Feed
      </button>

      {/* Signal header */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className={`${config.bg} ${config.text} ${config.border} border text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide`}>
            {config.label}
          </span>
          <span className="text-slate-500 text-sm capitalize">{signal.source}</span>
          {signal.source_url && (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors ml-auto"
            >
              View Source
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <h1 className="text-white text-xl font-bold leading-snug mb-3">
          {signal.title}
        </h1>

        <div className="flex items-center gap-4 text-slate-500 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {(() => {
              try {
                return format(new Date(signal.created_at), 'MMM d, yyyy • h:mm a');
              } catch { return 'Unknown date'; }
            })()}
          </span>
          <span className="font-mono text-slate-600">ID: {signal.id?.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Scores */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-slate-500" />
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wide">Signal Scores</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ScoreDisplay label="Confidence" value={signal.confidence} color={config.color} />
          <ScoreDisplay label="Materiality" value={signal.materiality} color={config.color} />
          <ScoreDisplay label="Urgency" value={signal.urgency} color={config.color} />
        </div>
      </div>

      {/* Description */}
      <div className="card p-6">
        <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">Signal Analysis</h2>
        <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
          {signal.description}
        </p>
      </div>

      {/* Affected Companies */}
      {companies.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Affected Companies ({companies.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {companies.map((company) => (
              <Link
                key={company}
                to={`/?company=${encodeURIComponent(company)}`}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
              >
                {company}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
