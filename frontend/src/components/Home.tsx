import { ArrowRight, Activity, Flame, Timer, TrendingUp } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NAV_ITEMS } from '@/nav';
import { Logo, WordMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { TabKey } from '@/context/AppContext';

export function Home() {
  const { setView, setTab, stats } = useApp();

  const enter = (tab: TabKey = 'dashboard') => {
    setTab(tab);
    setView('app');
  };

  const hasData = (stats?.totals.sessions ?? 0) > 0;

  return (
    <div className="app-root min-h-screen overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-14">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <Logo className="h-16 w-16" />
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
            Train like you mean it,{' '}
            <WordMark className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent" />
          </h1>
          <p className="mt-4 max-w-xl text-balance text-zinc-400">
            The fitness tracker built for soccer and track athletes. Log every
            session, watch your training load stay in the safe zone, and get an
            AI coach that plans your week, your meals and your recovery.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => enter('dashboard')}>
              {hasData ? 'Welcome back' : 'Open dashboard'}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => enter('coach')}>
              Ask the AI coach
            </Button>
          </div>
        </div>

        {/* Quick stats — start at zero and grow as sessions are logged */}
        {stats && (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat icon={Activity} label="Sessions" value={stats.totals.sessions} />
            <MiniStat icon={Timer} label="Hours" value={stats.totals.hours} />
            <MiniStat
              icon={TrendingUp}
              label="Distance"
              value={`${stats.totals.distance_mi} mi`}
            />
            <MiniStat icon={Flame} label="Streak" value={`${stats.streak_days} d`} />
          </div>
        )}

        {/* Feature grid */}
        <div className="mt-14">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Everything in one place
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.key}
                  onClick={() => enter(item.key)}
                  className="group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:border-brand-600/40 hover:bg-zinc-900/80"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/15 text-brand-400 ring-1 ring-brand-600/20 transition-colors group-hover:bg-brand-600/25">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-medium text-zinc-100">{item.label}</h3>
                  <p className="mt-1 text-sm leading-snug text-zinc-400">
                    {item.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        <p className="mt-14 text-center text-xs text-zinc-600">
          Your data is stored locally on this machine — private and portable.
        </p>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/15 text-brand-400">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-semibold leading-none text-zinc-50">{value}</p>
        <p className="mt-1 text-xs text-zinc-500">{label}</p>
      </div>
    </Card>
  );
}
