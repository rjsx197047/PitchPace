import { cn } from '@/lib/utils';

/** PitchPace mark — a stylised pitch + motion chevrons in brand emerald. */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-900/50',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[60%] w-[60%]">
        <path
          d="M4 6h16M4 12h16M4 18h16"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M6 16l4-4-4-4M12 16l4-4-4-4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function WordMark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight', className)}>
      Pitch<span className="text-brand-400">Pace</span>
    </span>
  );
}
