import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TrendingUp, Shield, Activity, Zap } from 'lucide-react';

const SECTOR_COLORS = {
  defense: '#3b82f6',
  healthcare: '#10b981',
  energy: '#f59e0b',
};

const SECTOR_ICONS = {
  defense: Shield,
  healthcare: Activity,
  energy: Zap,
};

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-medium mb-1">{label}</p>
          <p className="text-white text-2xl font-bold">{value}</p>
          {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg" style={{ background: `${color}20` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-slate-300 text-xs font-semibold capitalize mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-white text-sm">
          {p.value} signals
        </p>
      ))}
    </div>
  );
};

export default function StatsPanel({ stats }) {
  if (!stats) return null;

  const { bySector = [], totalSignals = 0 } = stats;

  const chartData = bySector.map((s) => ({
    name: s.sector,
    count: parseInt(s.count, 10),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Signals"
          value={totalSignals.toLocaleString()}
          icon={TrendingUp}
          color="#3b82f6"
        />
        {bySector.map((s) => {
          const Icon = SECTOR_ICONS[s.sector] || TrendingUp;
          return (
            <StatCard
              key={s.sector}
              label={`${s.sector.charAt(0).toUpperCase() + s.sector.slice(1)} Signals`}
              value={parseInt(s.count, 10).toLocaleString()}
              sub={`Avg confidence: ${s.avg_confidence}`}
              icon={Icon}
              color={SECTOR_COLORS[s.sector] || '#64748b'}
            />
          );
        })}
      </div>

      {chartData.length > 0 && (
        <div className="card p-4">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-4">
            Signals by Sector
          </h3>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={SECTOR_COLORS[entry.name] || '#64748b'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
