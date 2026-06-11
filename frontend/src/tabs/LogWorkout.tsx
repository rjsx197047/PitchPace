import { useRef, useState } from 'react';
import {
  Dumbbell,
  CheckCircle2,
  ArrowRight,
  Plus,
  History as HistoryIcon,
  Upload,
  Watch,
  X,
} from 'lucide-react';
import { useApp, type TabKey } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { workoutMeta, intensityMeta } from '@/lib/workoutMeta';
import { todayISO, longDate, fmt } from '@/lib/utils';
import { parseImportFile, type WorkoutInput } from '@/api/client';

const TYPES = [
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
];

// Each activity type logs its own tailored set of detail fields. The core
// fields (date, title, duration, intensity, calories, notes) are shared by
// every type; `showDistance` adds the miles input, and `fields` are stored on
// the workout's `metrics` blob (number unless kind === 'text').
type MetricKind = 'number' | 'text';
interface MetricField {
  key: string;
  label: string;
  kind?: MetricKind;
  placeholder?: string;
}
interface ActivityConfig {
  showDistance?: boolean;
  fields: MetricField[];
}

const ACTIVITY_CONFIG: Record<string, ActivityConfig> = {
  Match: {
    fields: [
      { key: 'position', label: 'Position', kind: 'text', placeholder: 'Winger' },
      { key: 'minutes_played', label: 'Minutes played', placeholder: '90' },
      { key: 'goals', label: 'Goals', placeholder: '0' },
      { key: 'assists', label: 'Assists', placeholder: '0' },
    ],
  },
  'Team Training': {
    fields: [
      { key: 'position', label: 'Position', kind: 'text', placeholder: 'Winger' },
      { key: 'drill_focus', label: 'Drill focus', kind: 'text', placeholder: 'Finishing' },
      { key: 'minutes_played', label: 'Minutes', placeholder: '75' },
    ],
  },
  'Sprint / Track Session': {
    fields: [
      { key: 'reps', label: 'Reps', placeholder: '6' },
      { key: 'rep_distance_m', label: 'Rep distance (m)', placeholder: '200' },
      { key: 'rest_s', label: 'Rest / rep (s)', placeholder: '120' },
    ],
  },
  'Distance Run': {
    showDistance: true,
    fields: [
      { key: 'avg_pace', label: 'Avg pace (min/mi)', kind: 'text', placeholder: '7:30' },
      { key: 'elevation_ft', label: 'Elevation gain (ft)', placeholder: '250' },
      { key: 'avg_hr', label: 'Avg HR (bpm)', placeholder: '150' },
    ],
  },
  'Tempo Run': {
    showDistance: true,
    fields: [
      { key: 'reps', label: 'Reps', placeholder: '4' },
      { key: 'rep_distance_m', label: 'Rep distance (m)', placeholder: '1600' },
      { key: 'avg_pace', label: 'Avg pace (min/mi)', kind: 'text', placeholder: '6:10' },
    ],
  },
  'Strength & Power': {
    fields: [
      { key: 'main_lift', label: 'Main lift', kind: 'text', placeholder: 'Back squat' },
      { key: 'sets', label: 'Sets', placeholder: '5' },
      { key: 'reps', label: 'Reps / set', placeholder: '5' },
      { key: 'load_kg', label: 'Load (kg)', placeholder: '80' },
    ],
  },
  Weightlifting: {
    fields: [
      { key: 'main_lift', label: 'Main lift', kind: 'text', placeholder: 'Clean & jerk' },
      { key: 'sets', label: 'Sets', placeholder: '5' },
      { key: 'reps', label: 'Reps / set', placeholder: '3' },
      { key: 'load_kg', label: 'Load (kg)', placeholder: '70' },
    ],
  },
  Calisthenics: {
    fields: [
      { key: 'skill', label: 'Skill / progression', kind: 'text', placeholder: 'Pull-ups' },
      { key: 'sets', label: 'Sets', placeholder: '5' },
      { key: 'reps', label: 'Reps / set', placeholder: '8' },
    ],
  },
  'Technical / Ball Work': {
    fields: [
      { key: 'drill_focus', label: 'Drill focus', kind: 'text', placeholder: 'First touch' },
      { key: 'touches', label: 'Touches', placeholder: '300' },
      { key: 'success_pct', label: 'Success rate (%)', placeholder: '85' },
    ],
  },
  Plyometrics: {
    fields: [
      { key: 'sets', label: 'Sets', placeholder: '4' },
      { key: 'reps', label: 'Reps / set', placeholder: '6' },
      { key: 'box_height_cm', label: 'Box height (cm)', placeholder: '60' },
      { key: 'contacts', label: 'Ground contacts', placeholder: '80' },
    ],
  },
  'Recovery / Mobility': {
    fields: [
      { key: 'modality', label: 'Modality', kind: 'text', placeholder: 'Foam roll / yoga' },
      { key: 'focus_areas', label: 'Focus areas', kind: 'text', placeholder: 'Hips, hamstrings' },
    ],
  },
  'Cross-Training': {
    showDistance: true,
    fields: [
      { key: 'modality', label: 'Modality', kind: 'text', placeholder: 'Bike / swim / row' },
      { key: 'avg_hr', label: 'Avg HR (bpm)', placeholder: '140' },
    ],
  },
  Boxing: {
    fields: [
      { key: 'rounds', label: 'Rounds', placeholder: '8' },
      { key: 'round_min', label: 'Round length (min)', placeholder: '3' },
      { key: 'format', label: 'Format', kind: 'text', placeholder: 'Bag / pads / sparring' },
      { key: 'punches', label: 'Punches thrown', placeholder: '400' },
    ],
  },
};

const EMPTY_CONFIG: ActivityConfig = { fields: [] };

export function LogWorkout() {
  const { addWorkouts, setTab, pushError } = useApp();

  // The activity currently being filled in.
  const [type, setType] = useState('Sprint / Track Session');
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [intensity, setIntensity] = useState(6);
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  // Type-specific detail fields, keyed by the active type's config.
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});

  // Activities queued to be saved together in one go.
  const [pending, setPending] = useState<WorkoutInput[]>([]);
  const [saving, setSaving] = useState(false);
  // When set, the form is replaced by a saved-confirmation screen.
  const [lastLogged, setLastLogged] = useState<WorkoutInput[] | null>(null);

  // Wearable import: parsed drafts awaiting review (multi-workout files).
  const [importing, setImporting] = useState(false);
  const [importDrafts, setImportDrafts] = useState<WorkoutInput[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const intensityInfo = intensityMeta(intensity);
  const config = ACTIVITY_CONFIG[type] ?? EMPTY_CONFIG;
  const setMetric = (key: string, v: string) =>
    setMetricValues((m) => ({ ...m, [key]: v }));

  const buildActivity = (): WorkoutInput => {
    const metrics: Record<string, unknown> = {};
    for (const f of config.fields) {
      const raw = metricValues[f.key];
      if (raw === undefined || raw.trim() === '') continue;
      metrics[f.key] = f.kind === 'text' ? raw.trim() : Number(raw);
    }
    return {
      date,
      type,
      title: title.trim(),
      duration_min: Number(duration) || 0,
      distance_mi: config.showDistance ? Number(distance) || 0 : 0,
      intensity,
      calories: calories ? Number(calories) : null,
      metrics,
      notes: notes.trim(),
    };
  };

  // "Filled" = the user entered something beyond just picking a type.
  const isCurrentFilled = () =>
    Number(duration) > 0 ||
    Number(distance) > 0 ||
    title.trim() !== '' ||
    notes.trim() !== '' ||
    config.fields.some((f) => (metricValues[f.key] ?? '').trim() !== '');

  // Reset just the activity inputs (keep the shared date for the next one).
  const resetActivityFields = () => {
    setType('Sprint / Track Session');
    setTitle('');
    setDuration('');
    setDistance('');
    setIntensity(6);
    setCalories('');
    setNotes('');
    setMetricValues({});
  };

  const resetAll = () => {
    setDate(todayISO());
    resetActivityFields();
    setPending([]);
  };

  const addAnother = () => {
    if (!isCurrentFilled()) return;
    setPending((p) => [...p, buildActivity()]);
    resetActivityFields();
  };

  const removePending = (i: number) =>
    setPending((p) => p.filter((_, idx) => idx !== i));

  // The current activity is included on save when it's filled, or when it's the
  // only thing (so a quick single-session log still works).
  const willSaveCurrent = pending.length === 0 || isCurrentFilled();
  const totalCount = pending.length + (willSaveCurrent ? 1 : 0);

  const submit = async () => {
    const toSave = [...pending];
    if (willSaveCurrent) toSave.push(buildActivity());
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await addWorkouts(toSave);
      setLastLogged(toSave);
      resetAll();
    } catch {
      /* error toast handled in context */
    } finally {
      setSaving(false);
    }
  };

  const exitTo = (tab: TabKey) => {
    setLastLogged(null);
    setTab(tab);
  };

  // ── Wearable import ──────────────────────────────────────────────────────

  // Prefill the form from a single imported draft so the user can review it.
  const prefillFromDraft = (d: WorkoutInput) => {
    const draftType = TYPES.includes(d.type) ? d.type : 'Cross-Training';
    setType(draftType);
    setDate(d.date);
    setTitle(d.title ?? '');
    setDuration(d.duration_min ? String(d.duration_min) : '');
    setDistance(d.distance_mi ? String(d.distance_mi) : '');
    setIntensity(d.intensity || 5);
    setCalories(d.calories ? String(d.calories) : '');
    setNotes(d.notes ?? '');
    const cfg = ACTIVITY_CONFIG[draftType] ?? EMPTY_CONFIG;
    const values: Record<string, string> = {};
    for (const f of cfg.fields) {
      const v = (d.metrics ?? {})[f.key];
      if (v !== undefined && v !== null && v !== '') values[f.key] = String(v);
    }
    setMetricValues(values);
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await parseImportFile(file);
      if (result.workouts.length === 1) {
        prefillFromDraft(result.workouts[0]);
      } else {
        setImportDrafts(result.workouts);
      }
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not read that file');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const importSelected = async (selected: WorkoutInput[]) => {
    setSaving(true);
    try {
      await addWorkouts(selected);
      setImportDrafts(null);
      setLastLogged(selected);
    } catch {
      /* error toast handled in context */
    } finally {
      setSaving(false);
    }
  };

  // ── Saved confirmation ─────────────────────────────────────────────────
  if (lastLogged) {
    return (
      <SavedConfirmation
        activities={lastLogged}
        onLogAnother={() => setLastLogged(null)}
        onExit={exitTo}
      />
    );
  }

  // ── Import review (multi-workout files, e.g. Apple Health) ─────────────
  if (importDrafts) {
    return (
      <ImportReview
        drafts={importDrafts}
        saving={saving}
        onCancel={() => setImportDrafts(null)}
        onImport={importSelected}
      />
    );
  }

  const addingMore = pending.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Import from a watch or fitness app */}
      <Card className="border-zinc-800/80">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-500/25 bg-brand-500/15 text-brand-300">
              <Watch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Import from a watch or app</p>
              <p className="text-xs text-zinc-500">
                Garmin .fit / .tcx · Strava .gpx · Apple Health export (.xml / .zip)
              </p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".tcx,.gpx,.fit,.xml,.zip"
            className="hidden"
            aria-label="Import workout file"
            onChange={(e) => onImportFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4" /> {importing ? 'Reading…' : 'Choose file'}
          </Button>
        </CardContent>
      </Card>

      {/* Queued activities */}
      {addingMore && (
        <Card className="animate-fade-in-up border-brand-700/30 bg-brand-950/10">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              This session · {pending.length}{' '}
              {pending.length === 1 ? 'activity' : 'activities'} queued
            </CardTitle>
            <span className="text-xs text-zinc-500">Saved together when you log</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((a, i) => {
              const meta = workoutMeta(a.type);
              const Icon = meta.icon;
              const ii = intensityMeta(a.intensity);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.chip}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-100">{a.title || a.type}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {a.type}
                      {a.duration_min ? ` · ${fmt(a.duration_min)}min` : ''}
                      {a.distance_mi ? ` · ${fmt(a.distance_mi)}mi` : ''} ·{' '}
                      <span className={ii.color}>RPE {a.intensity}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => removePending(i)}
                    className="text-zinc-500 transition-colors hover:text-red-400"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Type picker */}
      <Card>
        <CardHeader>
          <CardTitle>{addingMore ? 'Add another activity' : 'What did you do?'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {TYPES.map((t) => {
              const meta = workoutMeta(t);
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center text-xs transition-all ${
                    active
                      ? 'border-brand-600/50 bg-brand-600/15 text-brand-200 ring-1 ring-brand-600/30'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-brand-400' : meta.text}`} />
                  <span className="leading-tight">{t}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Activity details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                aria-label="Date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Title (optional)">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 6x200m @ 800 pace"
              />
            </Field>
            <Field label="Duration (min)">
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="55"
              />
            </Field>
            {config.showDistance && (
              <Field label="Distance (mi)">
                <Input
                  type="number"
                  step="0.1"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="3.2"
                />
              </Field>
            )}
          </div>

          {/* Per-type detail fields — each activity logs its own metrics. */}
          {config.fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-3 sm:grid-cols-3">
              {config.fields.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input
                    type={f.kind === 'text' ? 'text' : 'number'}
                    value={metricValues[f.key] ?? ''}
                    onChange={(e) => setMetric(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                </Field>
              ))}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Intensity (RPE)</Label>
              <Badge variant="neutral">
                <span className={intensityInfo.color}>
                  {intensity} · {intensityInfo.label}
                </span>
              </Badge>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              aria-label="Intensity (RPE 1 to 10)"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="range-accent w-full"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
              <span>Easy</span>
              <span>Moderate</span>
              <span>Hard</span>
              <span>Max</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Field label="Calories (optional)">
              <Input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="estimated kcal"
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it feel? Splits, opponents, niggles…"
                rows={3}
              />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" onClick={() => setTab('dashboard')}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={addAnother}
                disabled={!isCurrentFilled()}
                title={
                  isCurrentFilled()
                    ? 'Queue this activity and start another'
                    : 'Fill in this activity first'
                }
              >
                <Plus className="h-4 w-4" /> Add another
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? (
                  'Saving…'
                ) : (
                  <>
                    <Dumbbell className="h-4 w-4" />{' '}
                    {totalCount > 1 ? `Log all (${totalCount})` : 'Log session'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Saved confirmation screen (handles one or many activities) ─────────────

function SavedConfirmation({
  activities,
  onLogAnother,
  onExit,
}: {
  activities: WorkoutInput[];
  onLogAnother: () => void;
  onExit: (tab: TabKey) => void;
}) {
  const multiple = activities.length > 1;
  return (
    <div className="mx-auto max-w-lg">
      <Card className="animate-fade-in-up border-brand-700/40 bg-gradient-to-br from-brand-950/40 to-zinc-900/50">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/20 text-brand-300 ring-1 ring-brand-600/40">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-zinc-50">
            {multiple ? `${activities.length} sessions saved` : 'Session saved'}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{longDate(activities[0].date)}</p>

          {/* Per-activity summary */}
          <div className="mt-5 w-full space-y-2 text-left">
            {activities.map((a, i) => {
              const meta = workoutMeta(a.type);
              const Icon = meta.icon;
              const ii = intensityMeta(a.intensity);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/50 px-3 py-2"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.chip}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-100">{a.title || a.type}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {a.type}
                      {a.duration_min ? ` · ${fmt(a.duration_min)}min` : ''}
                      {a.distance_mi ? ` · ${fmt(a.distance_mi)}mi` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs ${ii.color}`}>RPE {a.intensity}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={onLogAnother}>
              <Plus className="h-4 w-4" /> Log more
            </Button>
            <Button onClick={() => onExit('history')}>
              <HistoryIcon className="h-4 w-4" /> View in history
            </Button>
          </div>
          <button
            onClick={() => onExit('dashboard')}
            className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Back to dashboard <ArrowRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Import review (pick which parsed workouts to keep) ─────────────────────

function ImportReview({
  drafts,
  saving,
  onCancel,
  onImport,
}: {
  drafts: WorkoutInput[];
  saving: boolean;
  onCancel: () => void;
  onImport: (selected: WorkoutInput[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(drafts.map((_, i) => i)),
  );
  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const chosen = drafts.filter((_, i) => selected.has(i));

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="animate-fade-in-up">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            Found {drafts.length} workouts — choose what to import
          </CardTitle>
          <button
            onClick={() =>
              setSelected(
                selected.size === drafts.length
                  ? new Set()
                  : new Set(drafts.map((_, i) => i)),
              )
            }
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            {selected.size === drafts.length ? 'Select none' : 'Select all'}
          </button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
            {drafts.map((d, i) => {
              const meta = workoutMeta(d.type);
              const Icon = meta.icon;
              const active = selected.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-brand-600/40 bg-brand-600/10'
                      : 'border-zinc-800/60 bg-zinc-900/40 opacity-60'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.chip}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-100">{d.title || d.type}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {d.date} · {d.type}
                      {d.duration_min ? ` · ${fmt(d.duration_min)}min` : ''}
                      {d.distance_mi ? ` · ${fmt(d.distance_mi)}mi` : ''}
                    </p>
                  </div>
                  <CheckCircle2
                    className={`h-5 w-5 shrink-0 ${
                      active ? 'text-brand-400' : 'text-zinc-700'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={() => onImport(chosen)}
              disabled={saving || chosen.length === 0}
            >
              <Upload className="h-4 w-4" />
              {saving
                ? 'Importing…'
                : `Import ${chosen.length} session${chosen.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
