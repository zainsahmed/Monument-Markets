import React from 'react';
import { Search, Filter, X } from 'lucide-react';

const SECTORS = [
  { value: '', label: 'All Sectors' },
  { value: 'defense', label: 'Defense' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'energy', label: 'Energy' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

export default function FilterBar({ filters, onChange, onClear }) {
  const hasActiveFilters =
    filters.sector || filters.company || filters.startDate || filters.endDate;

  function handleChange(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search by company */}
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search company..."
            value={filters.company || ''}
            onChange={(e) => handleChange('company', e.target.value)}
            className="input-field pl-8 text-xs py-2"
          />
        </div>

        {/* Sector filter */}
        <select
          value={filters.sector || ''}
          onChange={(e) => handleChange('sector', e.target.value)}
          className="input-field w-auto text-xs py-2 pr-8 appearance-none bg-no-repeat cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundPosition: 'right 8px center',
          }}
        >
          {SECTORS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
            className="input-field w-auto text-xs py-2"
            placeholder="Start date"
            title="Start date"
          />
          <span className="text-slate-600 text-xs">→</span>
          <input
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            className="input-field w-auto text-xs py-2"
            placeholder="End date"
            title="End date"
          />
        </div>

        {/* Sort */}
        <select
          value={filters.sort || 'newest'}
          onChange={(e) => handleChange('sort', e.target.value)}
          className="input-field w-auto text-xs py-2 pr-8 appearance-none bg-no-repeat cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
            backgroundPosition: 'right 8px center',
          }}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-2 rounded-lg hover:bg-slate-800 border border-slate-700 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
