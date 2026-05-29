import { Loader2 } from 'lucide-react';

export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-400" />
      <span
        className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-400"
        style={{ animationDelay: '0.2s' }}
      />
      <span
        className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-400"
        style={{ animationDelay: '0.4s' }}
      />
    </span>
  );
}
