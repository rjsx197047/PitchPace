import { useState } from 'react';
import type { WeekPoint } from '@/api/client';

// ── Weekly trend: animated CSS bar chart ────────────────────────────────────

interface BarChartProps {
  data: WeekPoint[];
  metric: 'minutes' | 'distance' | 'load' | 'sessions';
  unit?: string;
}

export function WeeklyBarChart({ data, metric, unit = '' }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d[metric] as number));

  const BAR_AREA = 160; // px — definite height so percentage bars resolve

  return (
    <div className="flex items-end gap-2">
      {data.map((d, i) => {
        const val = d[metric] as number;
        const pct = (val / max) * 100;
        const active = hover === i;
        const barPx = val > 0 ? Math.max((pct / 100) * BAR_AREA, 4) : 0;
        return (
          <div
            key={d.week}
            className="group relative flex flex-1 flex-col items-center gap-2"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="flex w-full items-end justify-center"
              style={{ height: BAR_AREA }}
            >
              {active && (
                <div className="absolute -top-2 z-10 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 shadow-lg">
                  <span className="font-semibold text-brand-300">
                    {val}
                    {unit && ` ${unit}`}
                  </span>
                  <span className="ml-1 text-zinc-500">· {d.sessions} sess</span>
                </div>
              )}
              <div
                className="w-full max-w-[2.4rem] origin-bottom rounded-t-md bg-gradient-to-t from-brand-700 to-brand-400 transition-all duration-300 animate-bar-grow"
                style={{ height: barPx, opacity: active ? 1 : 0.85 }}
              />
            </div>
            <span className="text-[10px] text-zinc-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Session-type breakdown: horizontal bars ─────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  Match: 'bg-brand-400',
  'Team Training': 'bg-brand-500',
  'Sprint / Track Session': 'bg-emerald-400',
  'Distance Run': 'bg-teal-400',
  'Tempo Run': 'bg-teal-500',
  'Strength & Power': 'bg-lime-400',
  Weightlifting: 'bg-orange-400',
  Calisthenics: 'bg-violet-400',
  'Technical / Ball Work': 'bg-green-400',
  Plyometrics: 'bg-cyan-400',
  'Recovery / Mobility': 'bg-zinc-500',
  'Cross-Training': 'bg-sky-400',
  Boxing: 'bg-rose-400',
};

export function TypeBreakdown({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  if (!entries.length) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No sessions logged yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        return (
          <div key={type} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-zinc-300">{type}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${TYPE_COLORS[type] ?? 'bg-brand-500'} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-400">
              {count} · {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── ACWR gauge ──────────────────────────────────────────────────────────────

const ACWR_BANDS: Record<string, { label: string; color: string; ring: string }> = {
  'no-data': { label: 'No data', color: 'text-zinc-400', ring: 'stroke-zinc-600' },
  undertraining: { label: 'Building room', color: 'text-sky-400', ring: 'stroke-sky-400' },
  optimal: { label: 'Optimal', color: 'text-brand-400', ring: 'stroke-brand-400' },
  caution: { label: 'Caution', color: 'text-amber-400', ring: 'stroke-amber-400' },
  'high-risk': { label: 'High risk', color: 'text-red-400', ring: 'stroke-red-400' },
};

export function AcwrGauge({ acwr, status }: { acwr: number; status: string }) {
  const band = ACWR_BANDS[status] ?? ACWR_BANDS['no-data'];
  // Map ACWR 0..2 onto a 270° arc.
  const clamped = Math.min(acwr, 2);
  const frac = clamped / 2;
  const circumference = 2 * Math.PI * 42;
  const arc = circumference * 0.75; // 270deg visible
  const dash = arc * frac;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-[135deg]">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            className="stroke-zinc-800"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            className={band.ring}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: 'stroke-dasharray 700ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight text-zinc-50">
            {acwr.toFixed(2)}
          </span>
          <span className={`text-xs font-medium ${band.color}`}>{band.label}</span>
        </div>
      </div>
      <p className="mt-1 text-center text-[11px] leading-tight text-zinc-500">
        Acute : Chronic workload
        <br />
        sweet spot 0.8–1.3
      </p>
    </div>
  );
}
