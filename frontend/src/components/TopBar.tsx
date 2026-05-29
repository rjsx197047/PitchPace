import { useState } from 'react';
import { RefreshCw, Settings, Plus, User2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NAV_ITEMS } from '@/nav';
import { Button } from '@/components/ui/button';
import { SettingsDialog } from '@/components/SettingsDialog';
import { cn } from '@/lib/utils';

export function TopBar() {
  const { tab, setTab, refresh, loading, profile } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const item = NAV_ITEMS.find((n) => n.key === tab)!;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-800/70 bg-zinc-950/30 px-6 py-3.5 backdrop-blur-sm">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
          {item.label}
        </h1>
        <p className="truncate text-xs text-zinc-500">{item.description}</p>
      </div>

      <div className="flex items-center gap-2">
        {tab !== 'log' && (
          <Button variant="secondary" size="sm" onClick={() => setTab('log')}>
            <Plus className="h-4 w-4" /> Log
          </Button>
        )}
        <Button
          variant="icon"
          size="icon"
          onClick={refresh}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-800/60 py-1.5 pl-1.5 pr-3 text-sm text-zinc-200 transition-colors hover:bg-zinc-700/60"
          title="Athlete & settings"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600/80 text-xs font-semibold text-white">
            {profile?.name ? (
              profile.name.slice(0, 1).toUpperCase()
            ) : (
              <User2 className="h-3.5 w-3.5" />
            )}
          </span>
          <Settings className="h-4 w-4 text-zinc-400" />
        </button>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
