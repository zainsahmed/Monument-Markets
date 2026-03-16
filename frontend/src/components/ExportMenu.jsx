import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileJson, ChevronDown, Loader2 } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function ExportMenu({ filters = {} }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleExport(format) {
    setExporting(format);
    setError(null);
    setOpen(false);

    try {
      const params = {};
      if (filters.sector) params.sector = filters.sector;
      if (filters.company) params.company = filters.company;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await api.exportSignals(token, format, params);

      // Create download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monument-signals-${timestamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={!!exporting}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Export
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-10 w-44">
          <button
            onClick={() => handleExport('csv')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <FileText className="w-4 h-4 text-green-400" />
            Export as CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <FileJson className="w-4 h-4 text-blue-400" />
            Export as JSON
          </button>
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-1.5 text-red-400 text-xs bg-slate-800 border border-red-800 rounded-lg px-3 py-2 whitespace-nowrap z-10">
          {error}
        </p>
      )}
    </div>
  );
}
