import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  icon?: LucideIcon;
  accent?: 'brand' | 'amber' | 'sky' | 'red';
}

const accentMap = {
  brand: 'text-brand-400 bg-brand-500/10 ring-brand-500/20',
  amber: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
  sky: 'text-sky-400 bg-sky-500/10 ring-sky-500/20',
  red: 'text-red-400 bg-red-500/10 ring-red-500/20',
};

export function StatCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accent = 'brand',
}: StatCardProps) {
  return (
    <Card className="p-4 hover:border-zinc-700/80 animate-fade-in-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </p>
          <p className="mt-1.5 flex items-baseline gap-1">
            <span className="text-2xl font-semibold tracking-tight text-zinc-50">
              {value}
            </span>
            {unit && <span className="text-sm text-zinc-400">{unit}</span>}
          </p>
          {sub && <p className="mt-1 truncate text-xs text-zinc-500">{sub}</p>}
        </div>
        {Icon && (
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1',
              accentMap[accent],
            )}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
        )}
      </div>
    </Card>
  );
}
