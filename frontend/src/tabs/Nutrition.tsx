import { useEffect, useState } from 'react';
import { Salad, HeartPulse, Sparkles, RotateCcw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/Markdown';
import { ThinkingDots } from '@/components/LoadingOverlay';
import * as api from '@/api/client';

type Mode = 'nutrition' | 'recovery';

const META: Record<
  Mode,
  { icon: typeof Salad; title: string; blurb: string; cache: string; cta: string }
> = {
  nutrition: {
    icon: Salad,
    title: 'Nutrition guidance',
    blurb: 'Calorie & macro targets, fuelling and match-day eating, tuned to your body stats and load.',
    cache: 'pitchpace_last_nutrition',
    cta: 'Build my nutrition plan',
  },
  recovery: {
    icon: HeartPulse,
    title: 'Recovery protocol',
    blurb: 'Sleep, mobility and deload guidance based on your current training balance.',
    cache: 'pitchpace_last_recovery',
    cta: 'Build my recovery plan',
  },
};

export function Nutrition() {
  const [mode, setMode] = useState<Mode>('nutrition');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
        {(['nutrition', 'recovery'] as Mode[]).map((m) => {
          const Icon = META[m].icon;
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm capitalize transition-colors ${
                active
                  ? 'bg-brand-600/20 text-brand-200 ring-1 ring-brand-600/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {m}
            </button>
          );
        })}
      </div>

      <Panel key={mode} mode={mode} />
    </div>
  );
}

function Panel({ mode }: { mode: Mode }) {
  const { pushError, stats } = useApp();
  const meta = META[mode];
  const Icon = meta.icon;
  const [focus, setFocus] = useState('');
  const [text, setText] = useState('');
  const [backend, setBackend] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(meta.cache);
      if (cached) {
        const parsed = JSON.parse(cached);
        setText(parsed.text);
        setBackend(parsed.backend);
      } else {
        setText('');
        setBackend(null);
      }
    } catch {
      /* ignore */
    }
  }, [meta.cache]);

  const generate = async () => {
    setLoading(true);
    try {
      const res =
        mode === 'nutrition'
          ? await api.coachNutrition(focus)
          : await api.coachRecovery(focus);
      setText(res.text);
      setBackend(res.backend);
      try {
        localStorage.setItem(meta.cache, JSON.stringify(res));
      } catch {
        /* ignore */
      }
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not generate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-brand-700/30 bg-gradient-to-br from-brand-950/30 to-zinc-900/40">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-medium text-zinc-100">{meta.title}</h2>
              <p className="text-sm text-zinc-400">
                {meta.blurb}
                {mode === 'recovery' && stats
                  ? ` Current load is ${stats.load.status}.`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={
                mode === 'nutrition'
                  ? "Optional — e.g. 'vegetarian' or 'fuelling for a tournament weekend'"
                  : "Optional — e.g. 'tight hamstrings' or 'poor sleep this week'"
              }
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
            <Button onClick={generate} disabled={loading} className="shrink-0">
              {text ? (
                <>
                  <RotateCcw className="h-4 w-4" /> Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> {meta.cta}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="min-h-[20rem]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-sm text-zinc-400">
              <ThinkingDots />
              <p className="mt-3">
                {mode === 'nutrition'
                  ? 'Crunching your fuelling needs…'
                  : 'Assessing your recovery…'}
              </p>
            </div>
          ) : text ? (
            <div>
              {backend && (
                <div className="mb-3 flex justify-end">
                  <Badge variant={backend === 'none' ? 'warning' : 'success'}>
                    {backend === 'claude'
                      ? 'Built by Claude'
                      : backend === 'ollama'
                        ? 'Built by local Ollama'
                        : 'AI offline'}
                  </Badge>
                </div>
              )}
              <Markdown text={text} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Icon className="h-10 w-10 text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-500">
                Nothing generated yet — hit the button above.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
