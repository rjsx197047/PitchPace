import { Home, Circle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { NAV_ITEMS } from '@/nav';
import { Logo, WordMark } from '@/components/Logo';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const { tab, setTab, setView, health, apiKeyPresent } = useApp();

  const aiLabel = apiKeyPresent
    ? 'Claude coach active'
    : health?.ollama_available
      ? 'Local AI (Ollama)'
      : 'AI offline';
  const aiOk = apiKeyPresent || health?.ollama_available;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800/70 bg-zinc-950/40 px-3 py-4">
      <button
        onClick={() => setView('home')}
        className="mb-6 flex items-center gap-2.5 px-2 text-left"
      >
        <Logo className="h-9 w-9" />
        <div className="leading-tight">
          <WordMark className="text-base text-zinc-100" />
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Soccer · Track
          </p>
        </div>
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all',
                active
                  ? 'bg-brand-600/15 text-brand-200 ring-1 ring-brand-600/25'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100',
              )}
            >
              <Icon
                className={cn(
                  'h-4.5 w-4.5 shrink-0',
                  active ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-300',
                )}
                strokeWidth={2}
              />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3 border-t border-zinc-800/70 pt-3">
        <div className="flex items-center gap-2 px-2 text-xs text-zinc-500">
          <Circle
            className={cn(
              'h-2 w-2 fill-current',
              aiOk ? 'text-brand-400' : 'text-amber-400',
            )}
          />
          {aiLabel}
        </div>
        <button
          onClick={() => setView('home')}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          <Home className="h-4 w-4" /> Back to home
        </button>
      </div>
    </aside>
  );
}
