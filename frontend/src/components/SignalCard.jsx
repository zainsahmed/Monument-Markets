import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Building2, ChevronRight } from 'lucide-react';

const SECTOR_CONFIG = {
  defense: {
    label: 'Defense',
    badgeClass: 'badge-defense',
    barColor: 'bg-blue-500',
    borderColor: 'border-l-blue-600',
  },
  healthcare: {
    label: 'Healthcare',
    badgeClass: 'badge-healthcare',
    barColor: 'bg-emerald-500',
    borderColor: 'border-l-emerald-600',
  },
  energy: {
    label: 'Energy',
    badgeClass: 'badge-energy',
    barColor: 'bg-amber-500',
    borderColor: 'border-l-amber-500',
  },
};

function ScoreBar({ value, max = 10, color }) {
  return (
    <div className="score-bar w-16">
      <div
        className={`score-bar-fill ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

function ScoreRow({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 text-xs w-20">{label}</span>
      <ScoreBar value={value} color={color} />
      <span className="text-slate-300 text-xs font-mono font-medium">{value}/10</span>
    </div>
  );
}

export default function SignalCard({ signal }) {
  const config = SECTOR_CONFIG[signal.sector] || SECTOR_CONFIG.defense;
  const companies = Array.isArray(signal.affected_companies)
    ? signal.affected_companies
    : [];

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(signal.created_at), { addSuffix: true });
    } catch {
      return 'recently';
    }
  })();

  return (
    <div
      className={`card border-l-4 ${config.borderColor} hover:bg-slate-800/50 transition-colors duration-150`}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={config.badgeClass}>{config.label}</span>
            <span className="text-slate-500 text-xs capitalize">
              {signal.source}
            </span>
            <span className="text-slate-600 text-xs">·</span>
            <span className="text-slate-500 text-xs">{timeAgo}</span>
          </div>
          {signal.source_url && (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-blue-400 transition-colors flex-shrink-0"
              title="View source"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Title */}
        <Link to={`/signals/${signal.id}`} className="group">
          <h3 className="text-slate-100 font-semibold text-sm leading-snug mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
            {signal.title}
          </h3>
        </Link>

        {/* Description */}
        <p className="text-slate-400 text-xs leading-relaxed mb-4 line-clamp-3">
          {signal.description}
        </p>

        {/* Companies */}
        {companies.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span className="text-slate-500 text-xs font-medium">Affected Companies</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {companies.slice(0, 5).map((company) => (
                <span
                  key={company}
                  className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded border border-slate-700"
                >
                  {company}
                </span>
              ))}
              {companies.length > 5 && (
                <span className="text-slate-500 text-xs px-1 py-0.5">
                  +{companies.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scores */}
        <div className="space-y-1.5 pt-3 border-t border-slate-800">
          <ScoreRow label="Confidence" value={signal.confidence} color={config.barColor} />
          <ScoreRow label="Materiality" value={signal.materiality} color={config.barColor} />
          <ScoreRow label="Urgency" value={signal.urgency} color={config.barColor} />
        </div>

        {/* View link */}
        <Link
          to={`/signals/${signal.id}`}
          className="mt-3 flex items-center gap-1 text-slate-500 hover:text-blue-400 text-xs transition-colors"
        >
          View full signal
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
