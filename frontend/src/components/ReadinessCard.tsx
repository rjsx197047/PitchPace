import { useEffect, useState } from 'react';
import { HeartPulse, Pencil } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import * as api from '@/api/client';

const SORE_AREAS = [
  'Hamstrings',
  'Quads',
  'Calves',
  'Groin',
  'Hip flexors',
  'Knees',
  'Ankles',
  'Shins',
  'Lower back',
  'Shoulders',
];

const STATUS_META: Record<
  api.ReadinessScore['status'],
  { color: string; badge: 'success' | 'neutral' | 'warning' | 'danger'; hint: string }
> = {
  primed: { color: 'text-brand-400', badge: 'success', hint: 'Green light — a big session will land well today.' },
  ready: { color: 'text-sky-400', badge: 'neutral', hint: 'Good to train as planned.' },
  caution: { color: 'text-amber-400', badge: 'warning', hint: 'Trim volume or intensity today.' },
  'rest-day': { color: 'text-red-400', badge: 'danger', hint: 'Recovery day — sleep, mobility, fuel.' },
};

/** Morning readiness: today's check-in + score, or a prompt to do one. */
export function ReadinessCard() {
  const [checkin, setCheckin] = useState<api.Checkin | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .getTodayCheckin()
      .then(setCheckin)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const r = checkin?.readiness;

  return (
    <>
      <Card className="border-zinc-800/80">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          {checkin && r ? (
            <>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className={`text-3xl font-semibold tabular-nums ${STATUS_META[r.status].color}`}>
                    {r.score}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">readiness</p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_META[r.status].badge}>{r.status}</Badge>
                    <span className="hidden text-xs text-zinc-500 sm:inline">
                      {STATUS_META[r.status].hint}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    sleep {checkin.sleep_h}h · quality {checkin.sleep_quality}/5 · energy{' '}
                    {checkin.energy}/5 · soreness {checkin.soreness}/5
                    {checkin.sore_areas.length > 0 && ` · sore: ${checkin.sore_areas.join(', ')}`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Update
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/25 bg-brand-500/15 text-brand-300">
                  <HeartPulse className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100">Morning check-in</p>
                  <p className="text-xs text-zinc-500">
                    60 seconds — sleep, energy, soreness. Your coach tunes today's load to it.
                  </p>
                </div>
              </div>
              <Button onClick={() => setOpen(true)}>
                <HeartPulse className="h-4 w-4" /> Check in
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {open && (
        <CheckinDialog
          initial={checkin}
          onClose={() => setOpen(false)}
          onSaved={(c) => {
            setCheckin(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function CheckinDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: api.Checkin | null;
  onClose: () => void;
  onSaved: (c: api.Checkin) => void;
}) {
  const { pushError } = useApp();
  const [sleepH, setSleepH] = useState(initial ? String(initial.sleep_h) : '');
  const [quality, setQuality] = useState(initial?.sleep_quality ?? 3);
  const [energy, setEnergy] = useState(initial?.energy ?? 3);
  const [soreness, setSoreness] = useState(initial?.soreness ?? 1);
  const [areas, setAreas] = useState<string[]>(initial?.sore_areas ?? []);
  const [restingHr, setRestingHr] = useState(initial?.resting_hr ? String(initial.resting_hr) : '');
  const [hrv, setHrv] = useState(initial?.hrv_ms ? String(initial.hrv_ms) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const toggleArea = (a: string) =>
    setAreas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveCheckin({
        sleep_h: Number(sleepH) || 0,
        sleep_quality: quality,
        energy,
        soreness,
        sore_areas: areas,
        resting_hr: restingHr ? Number(restingHr) : null,
        hrv_ms: hrv ? Number(hrv) : null,
        notes: notes.trim(),
      });
      onSaved(saved);
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not save check-in');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-brand-400" /> Morning check-in
          </DialogTitle>
          <DialogDescription>
            How you woke up today. HRV and resting HR are optional — scored against
            your own baseline when you log them.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Sleep (hours)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="14"
                value={sleepH}
                onChange={(e) => setSleepH(e.target.value)}
                placeholder="7.5"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Resting HR</Label>
              <Input
                type="number"
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>HRV (ms)</Label>
              <Input
                type="number"
                value={hrv}
                onChange={(e) => setHrv(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <SliderField label="Sleep quality" value={quality} onChange={setQuality} low="Rough" high="Great" />
          <SliderField label="Energy / mood" value={energy} onChange={setEnergy} low="Flat" high="Fired up" />
          <SliderField label="Muscle soreness" value={soreness} onChange={setSoreness} low="Fresh" high="Very sore" />

          {soreness >= 2 && (
            <div>
              <Label className="mb-2 block">Where are you sore?</Label>
              <div className="flex flex-wrap gap-1.5">
                {SORE_AREAS.map((a) => {
                  const active = areas.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => toggleArea(a)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        active
                          ? 'border-rose-600/40 bg-rose-600/15 text-rose-300'
                          : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. late match last night, hip tight"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save check-in'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SliderField({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  low: string;
  high: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs tabular-nums text-zinc-400">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        aria-label={`${label} (1 to 5)`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-accent w-full"
      />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
