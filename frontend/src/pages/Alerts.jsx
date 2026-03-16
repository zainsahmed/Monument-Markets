import React, { useState, useEffect } from 'react';
import { Bell, Check, Loader2, AlertCircle, Save, Trash2 } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';

const SECTORS = [
  { value: 'defense', label: 'Defense', description: 'DoD contracts, military spending, procurement' },
  { value: 'healthcare', label: 'Healthcare', description: 'Drug pricing, FDA, Medicare/Medicaid policy' },
  { value: 'energy', label: 'Energy', description: 'EPA regulations, energy subsidies, climate policy' },
];

const DEFENSE_COMPANIES = [
  'Lockheed Martin', 'Northrop Grumman', 'Raytheon Technologies',
  'Boeing', 'General Dynamics', 'Huntington Ingalls', 'L3Harris Technologies', 'Leidos',
];

const HEALTHCARE_COMPANIES = [
  'UnitedHealth Group', 'Anthem', 'Aetna', 'Pfizer', 'Merck',
  'Johnson & Johnson', 'Eli Lilly', 'AbbVie', 'Bristol Myers Squibb',
  'Moderna', 'CVS Health', 'Cigna',
];

const ENERGY_COMPANIES = [
  'ExxonMobil', 'Chevron', 'ConocoPhillips', 'NextEra Energy', 'Duke Energy',
  'American Electric Power', 'Dominion Energy', 'FirstEnergy', 'Sempra Energy', 'NRG Energy',
];

const ALL_COMPANIES = [...new Set([...DEFENSE_COMPANIES, ...HEALTHCARE_COMPANIES, ...ENERGY_COMPANIES])].sort();

function SectorToggle({ sector, selected, onToggle }) {
  const isSelected = selected.includes(sector.value);
  return (
    <button
      type="button"
      onClick={() => onToggle(sector.value)}
      className={`text-left p-4 rounded-xl border transition-colors ${
        isSelected
          ? 'bg-blue-950 border-blue-700 text-blue-100'
          : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{sector.label}</span>
        {isSelected && <Check className="w-4 h-4 text-blue-400" />}
      </div>
      <p className="text-xs text-slate-500">{sector.description}</p>
    </button>
  );
}

function CompanyToggle({ company, selected, onToggle }) {
  const isSelected = selected.includes(company);
  return (
    <button
      type="button"
      onClick={() => onToggle(company)}
      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        isSelected
          ? 'bg-blue-950 border-blue-700 text-blue-200'
          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}
    >
      {isSelected && <Check className="w-3 h-3 inline mr-1" />}
      {company}
    </button>
  );
}

export default function Alerts() {
  const { token } = useAuth();
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [alertId, setAlertId] = useState(null);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const data = await api.getAlerts(token);
        if (data.alerts.length > 0) {
          const alert = data.alerts[0];
          setAlertId(alert.id);
          setSelectedSectors(alert.sectors || []);
          setSelectedCompanies(alert.companies || []);
        }
      } catch (err) {
        // Non-critical
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, [token]);

  function toggleSector(sector) {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  }

  function toggleCompany(company) {
    setSelectedCompanies((prev) =>
      prev.includes(company) ? prev.filter((c) => c !== company) : [...prev, company]
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      await api.subscribe(token, selectedSectors, selectedCompanies);
      setMessage('Alert preferences saved. You\'ll receive emails for matching signals.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearAlerts() {
    if (!alertId) return;
    try {
      await api.deleteAlert(token, alertId);
      setSelectedSectors([]);
      setSelectedCompanies([]);
      setAlertId(null);
      setMessage('Alert preferences cleared.');
    } catch (err) {
      setError('Failed to clear alerts');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          Email Alert Preferences
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Choose which sectors and companies trigger email alerts when new signals are generated.
          Leave all unselected to receive alerts for everything.
        </p>
      </div>

      {message && (
        <div className="bg-green-950 border border-green-800 text-green-300 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4" />
          {message}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Sector selection */}
        <div className="card p-6">
          <h2 className="text-slate-300 font-semibold text-sm mb-4">
            Alert Sectors
            <span className="ml-2 text-slate-600 font-normal">
              ({selectedSectors.length} selected)
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SECTORS.map((sector) => (
              <SectorToggle
                key={sector.value}
                sector={sector}
                selected={selectedSectors}
                onToggle={toggleSector}
              />
            ))}
          </div>
        </div>

        {/* Company selection */}
        <div className="card p-6">
          <h2 className="text-slate-300 font-semibold text-sm mb-4">
            Alert Companies
            <span className="ml-2 text-slate-600 font-normal">
              ({selectedCompanies.length} selected)
            </span>
          </h2>

          {/* Defense */}
          <div className="mb-4">
            <h3 className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">Defense</h3>
            <div className="flex flex-wrap gap-2">
              {DEFENSE_COMPANIES.map((c) => (
                <CompanyToggle key={c} company={c} selected={selectedCompanies} onToggle={toggleCompany} />
              ))}
            </div>
          </div>

          {/* Healthcare */}
          <div className="mb-4">
            <h3 className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">Healthcare</h3>
            <div className="flex flex-wrap gap-2">
              {HEALTHCARE_COMPANIES.map((c) => (
                <CompanyToggle key={c} company={c} selected={selectedCompanies} onToggle={toggleCompany} />
              ))}
            </div>
          </div>

          {/* Energy */}
          <div>
            <h3 className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">Energy</h3>
            <div className="flex flex-wrap gap-2">
              {ENERGY_COMPANIES.map((c) => (
                <CompanyToggle key={c} company={c} selected={selectedCompanies} onToggle={toggleCompany} />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-between">
          <div className="text-slate-500 text-xs">
            {selectedSectors.length === 0 && selectedCompanies.length === 0
              ? 'You will receive alerts for all signals.'
              : `Alerts for: ${selectedSectors.length} sector(s), ${selectedCompanies.length} company(s)`}
          </div>
          <div className="flex items-center gap-2">
            {alertId && (
              <button
                type="button"
                onClick={handleClearAlerts}
                className="btn-ghost text-red-400 hover:text-red-300 flex items-center gap-1.5 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
