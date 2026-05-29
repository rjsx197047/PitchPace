import { useEffect, useState } from 'react';
import { CalendarRange, Sparkles, RotateCcw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/Markdown';
import { ThinkingDots } from '@/components/LoadingOverlay';
import * as api from '@/api/client';

const CACHE_KEY = 'pitchpace_last_plan';

export function TrainingPlan() {
  const { pushError, stats } = useApp();
  const [focus, setFocus] = useState('');
  const [plan, setPlan] = useState<string>('');
  const [backend, setBackend] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { text, backend: b } = JSON.parse(cached);
        setPlan(text);
        setBackend(b);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await api.coachPlan(focus);
      setPlan(res.text);
      setBackend(res.backend);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ text: res.text, backend: res.backend }));
      } catch {
        /* ignore */
      }
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not build plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-brand-700/30 bg-gradient-to-br from-brand-950/30 to-zinc-900/40">
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/30">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-medium text-zinc-100">7-day training plan</h2>
              <p className="text-sm text-zinc-400">
                Built from your profile and live training load
                {stats ? ` (ACWR ${stats.load.acwr}, ${stats.load.status})` : ''}.
                Add an emphasis below, or just generate.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Optional emphasis — e.g. 'sharpen speed before Saturday's match' or 'build 800m endurance'"
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
            <Button onClick={generate} disabled={loading} className="shrink-0">
              {plan ? (
                <>
                  <RotateCcw className="h-4 w-4" /> Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Build my plan
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
              <p className="mt-3">Coach is periodising your week…</p>
            </div>
          ) : plan ? (
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
              <Markdown text={plan} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarRange className="h-10 w-10 text-zinc-700" />
              <p className="mt-3 text-sm text-zinc-500">
                No plan yet. Hit <span className="text-brand-400">Build my plan</span>{' '}
                to generate one from your data.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
