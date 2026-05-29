import { useState } from 'react';
import {
  CalendarCheck,
  Flame,
  Route,
  Activity,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { StatCard } from '@/components/StatCard';
import { WeeklyBarChart, TypeBreakdown, AcwrGauge } from '@/components/Charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineLoader } from '@/components/LoadingOverlay';
import { workoutMeta, intensityMeta } from '@/lib/workoutMeta';
import { longDate, fmt } from '@/lib/utils';

type Metric = 'minutes' | 'distance' | 'load';

export function Dashboard() {
  const { stats, workouts, loading, setTab } = useApp();
  const [metric, setMetric] = useState<Metric>('load');

  if (loading && !stats) return <InlineLoader label="Loading your training…" />;
  if (!stats) return <InlineLoader />;

  const tw = stats.this_week;
  const targetPct = tw.target ? Math.min(100, Math.round((tw.sessions / tw.target) * 100)) : 0;
  const recent = workouts.slice(0, 6);

  const metricUnit = metric === 'minutes' ? 'min' : metric === 'distance' ? 'mi' : 'AU';
  const loadStatusVariant =
    stats.load.status === 'optimal'
      ? 'success'
      : stats.load.status === 'caution'
        ? 'warning'
        : stats.load.status === 'high-risk'
          ? 'danger'
          : 'neutral';

  return (
    <div className="space-y-5">
      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="This week"
          value={`${tw.sessions}/${tw.target}`}
          unit="sessions"
          sub={`${targetPct}% of target`}
          icon={CalendarCheck}
        />
        <StatCard
          label="Weekly load"
          value={fmt(tw.load)}
          unit="AU"
          sub={`${fmt(tw.minutes)} min trained`}
          icon={Activity}
          accent="sky"
        />
        <StatCard
          label="Distance"
          value={fmt(tw.distance_mi)}
          unit="mi"
          sub="this week"
          icon={Route}
          accent="brand"
        />
        <StatCard
          label="Streak"
          value={stats.streak_days}
          unit="days"
          sub={`avg RPE ${stats.totals.avg_intensity}/10 all-time`}
          icon={Flame}
          accent="amber"
        />
      </div>

      {/* Trend + ACWR */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>8-week trend</CardTitle>
            <div className="flex gap-1">
              {(['load', 'minutes', 'distance'] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-lg px-2.5 py-1 text-xs capitalize transition-colors ${
                    metric === m
                      ? 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <WeeklyBarChart data={stats.weeks} metric={metric} unit={metricUnit} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Training balance</CardTitle>
            <Badge variant={loadStatusVariant}>{stats.load.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AcwrGauge acwr={stats.load.acwr} status={stats.load.status} />
          </CardContent>
        </Card>
      </div>

      {/* Breakdown + recent */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session mix</CardTitle>
          </CardHeader>
          <CardContent>
            <TypeBreakdown data={stats.by_type} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent sessions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setTab('history')}>
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-sm text-zinc-500">No sessions yet.</p>
                <Button size="sm" className="mt-3" onClick={() => setTab('log')}>
                  Log your first workout
                </Button>
              </div>
            )}
            {recent.map((w) => {
              const meta = workoutMeta(w.type);
              const Icon = meta.icon;
              const intensity = intensityMeta(w.intensity);
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${meta.chip}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {w.title || w.type}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {longDate(w.date)} · {w.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums text-zinc-200">
                      {w.duration_min ? `${fmt(w.duration_min)}m` : ''}
                      {w.distance_mi ? ` · ${fmt(w.distance_mi)}mi` : ''}
                    </p>
                    <p className={`text-xs ${intensity.color}`}>
                      RPE {w.intensity} · {intensity.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Coach nudge */}
      <Card className="border-brand-700/30 bg-gradient-to-br from-brand-950/40 to-zinc-900/40">
        <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-zinc-100">
                Want a plan for next week?
              </p>
              <p className="text-sm text-zinc-400">
                Your coach can build a 7-day plan from this exact data — load,
                mix and all.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTab('coach')}>
              Ask coach
            </Button>
            <Button onClick={() => setTab('plan')}>
              Build plan <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
