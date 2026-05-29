import { AlertTriangle, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function ErrorToasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 rounded-xl border border-red-700/50 bg-red-950/80 px-3 py-2.5 text-sm text-red-100 shadow-lg shadow-black/40 backdrop-blur animate-fade-in-up"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="text-red-300/70 transition-colors hover:text-red-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
