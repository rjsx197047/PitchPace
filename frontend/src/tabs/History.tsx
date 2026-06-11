import { useMemo, useState } from 'react';
import { Pencil, Trash2, Search, Check, Download, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineLoader } from '@/components/LoadingOverlay';
import { workoutMeta, intensityMeta } from '@/lib/workoutMeta';
import { longDate, fmt } from '@/lib/utils';
import type { Workout, WorkoutInput } from '@/api/client';

const ALL_TYPES = [
  'Match',
  'Team Training',
  'Sprint / Track Session',
  'Distance Run',
  'Tempo Run',
  'Strength & Power',
  'Weightlifting',
  'Calisthenics',
  'Technical / Ball Work',
  'Plyometrics',
  'Recovery / Mobility',
  'Cross-Training',
  'Boxing',
  'Testing / Benchmarks',
];

export function HistoryTab() {
  const { workouts, loading, removeWorkout } = useApp();
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Workout | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const present = useMemo(() => {
    const set = new Set(workouts.map((w) => w.type));
    return ALL_TYPES.filter((t) => set.has(t));
  }, [workouts]);

  const filtered = useMemo(() => {
    return workouts.filter((w) => {
      if (filter !== 'all' && w.type !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          w.title.toLowerCase().includes(q) ||
          w.type.toLowerCase().includes(q) ||
          w.notes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workouts, filter, query]);

  if (loading && !workouts.length) return <InlineLoader label="Loading sessions…" />;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {filtered.length} of {workouts.length} sessions
          </span>
          <a
            href="/api/export.json"
            download
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            title="Download all data as JSON"
          >
            <Download className="h-3 w-3" /> JSON
          </a>
          <a
            href="/api/export.csv"
            download
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            title="Download sessions as CSV"
          >
            <Download className="h-3 w-3" /> CSV
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </Chip>
        {present.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {t}
          </Chip>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-zinc-500">
            No sessions match.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((w) => {
            const meta = workoutMeta(w.type);
            const Icon = meta.icon;
            const intensity = intensityMeta(w.intensity);
            const isConfirming = confirmId === w.id;
            return (
              <Card key={w.id} className="overflow-hidden">
                <CardContent className="flex items-center gap-3 py-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${meta.chip}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-zinc-100">
                        {w.title || w.type}
                      </p>
                      <Badge variant="neutral" className="hidden sm:inline-flex">
                        {w.type}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {longDate(w.date)}
                      {w.notes ? ` · ${w.notes}` : ''}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm tabular-nums text-zinc-200">
                      {w.duration_min ? `${fmt(w.duration_min)}m` : '—'}
                      {w.distance_mi ? ` · ${fmt(w.distance_mi)}mi` : ''}
                    </p>
                    <p className={`text-xs ${intensity.color}`}>
                      RPE {w.intensity}
                    </p>
                  </div>

                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          await removeWorkout(w.id);
                          setConfirmId(null);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" /> Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmId(null)}
                        aria-label="Cancel delete"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="icon"
                        size="icon"
                        onClick={() => setEditing(w)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="icon"
                        size="icon"
                        onClick={() => setConfirmId(w.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-400/80" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <EditDialog
          workout={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-brand-600/40 bg-brand-600/15 text-brand-300'
          : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function EditDialog({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { editWorkout } = useApp();
  const [form, setForm] = useState<WorkoutInput>({
    date: workout.date,
    type: workout.type,
    title: workout.title,
    duration_min: workout.duration_min,
    distance_mi: workout.distance_mi,
    intensity: workout.intensity,
    calories: workout.calories,
    metrics: workout.metrics,
    notes: workout.notes,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await editWorkout(workout.id, form);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const intensity = intensityMeta(form.intensity);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                aria-label="Date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                value={form.duration_min}
                onChange={(e) =>
                  setForm({ ...form, duration_min: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Distance (mi)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.distance_mi}
                onChange={(e) =>
                  setForm({ ...form, distance_mi: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Intensity (RPE)</Label>
              <span className={`text-xs ${intensity.color}`}>
                {form.intensity} · {intensity.label}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              aria-label="Intensity (RPE 1 to 10)"
              value={form.intensity}
              onChange={(e) =>
                setForm({ ...form, intensity: Number(e.target.value) })
              }
              className="range-accent w-full"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
