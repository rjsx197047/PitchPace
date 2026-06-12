import { useMemo } from 'react';
import { Timer, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shortDate } from '@/lib/utils';

// The metric keys logged by the "Testing / Benchmarks" activity type.
// For sprint times lower is better; for jumps and the beep test higher is.
const METRICS = [
  { key: 'forty_yd_s', label: '40yd dash', unit: 's', lowerBetter: true },
  { key: 'vertical_cm', label: 'Vertical jump', unit: 'cm', lowerBetter: false },
  { key: 'broad_jump_cm', label: 'Broad jump', unit: 'cm', lowerBetter: false },
  { key: 'shuttle_5_10_5_s', label: '5-10-5 shuttle', unit: 's', lowerBetter: true },
  { key: 'beep_level', label: 'Beep test', unit: '', lowerBetter: false },
];

interface Point {
  date: string;
  value: number;
}

const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Per-test progression from logged Testing / Benchmarks sessions. */
export function BenchmarkProgress() {
  const { workouts } = useApp();

  const series = useMemo(() => {
    const tests = workouts
      .filter((w) => w.type === 'Testing / Benchmarks')
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    return METRICS.map((m) => ({
      ...m,
      points: tests
        .map((w) => ({ date: w.date, value: Number((w.metrics ?? {})[m.key]) }))
        .filter((p): p is Point => Number.isFinite(p.value) && p.value > 0),
    })).filter((s) => s.points.length > 0);
  }, [workouts]);

  if (series.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-yellow-400" /> Benchmark progression
        </CardTitle>
        <span className="text-xs text-zinc-500">from your Testing / Benchmarks sessions</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {series.map((s) => {
          const values = s.points.map((p) => p.value);
          const best = s.lowerBetter ? Math.min(...values) : Math.max(...values);
          const latest = s.points[s.points.length - 1];
          const first = s.points[0];
          const delta = latest.value - first.value;
          const improved = s.lowerBetter ? delta < 0 : delta > 0;
          const flat = s.points.length < 2 || delta === 0;
          const DeltaIcon = delta < 0 ? TrendingDown : TrendingUp;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-zinc-300">{s.label}</span>
              <Sparkline points={s.points} lowerBetter={s.lowerBetter} />
              <div className="w-40 shrink-0 text-right">
                <p className="text-sm tabular-nums text-zinc-100">
                  {fmtVal(latest.value)}
                  {s.unit && <span className="text-zinc-500"> {s.unit}</span>}
                  <span className="ml-1.5 text-[11px] text-zinc-500">
                    best {fmtVal(best)}
                  </span>
                </p>
                <p
                  className={`flex items-center justify-end gap-1 text-[11px] ${
                    flat ? 'text-zinc-500' : improved ? 'text-brand-400' : 'text-red-400'
                  }`}
                >
                  {!flat && <DeltaIcon className="h-3 w-3" />}
                  {flat
                    ? `${s.points.length === 1 ? 'first test' : 'no change'} · ${shortDate(latest.date)}`
                    : `${delta > 0 ? '+' : ''}${fmtVal(delta)}${s.unit ? ` ${s.unit}` : ''} since ${shortDate(first.date)}`}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Tiny inline trend line; green when the trend direction is an improvement. */
function Sparkline({ points, lowerBetter }: { points: Point[]; lowerBetter: boolean }) {
  const W = 200;
  const H = 28;
  const PAD = 3;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const path = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = points[points.length - 1].value;
  const improvedOverall =
    points.length > 1 && (lowerBetter ? last < values[0] : last > values[0]);
  const stroke = points.length < 2 ? '#71717a' : improvedOverall ? '#34d399' : '#f87171';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 min-w-0 flex-1"
      preserveAspectRatio="none"
      role="img"
      aria-label="benchmark trend"
    >
      <polyline points={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="2.5" fill={stroke} />
      ))}
    </svg>
  );
}
