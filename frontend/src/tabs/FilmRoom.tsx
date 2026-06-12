import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clapperboard,
  Film,
  FolderOpen,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { todayISO, longDate } from '@/lib/utils';
import * as api from '@/api/client';

// Soccer-first tag set; "Highlight" is the catch-all for anything worth a rewatch.
const TAG_LABELS = [
  'Goal',
  'Assist',
  'Shot',
  'Key pass',
  'Dribble',
  'Sprint',
  'Press',
  'Tackle',
  'Interception',
  'Foul',
  'Mistake',
  'Highlight',
];

const TAG_COLORS: Record<string, string> = {
  Goal: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Assist: 'border-brand-500/40 bg-brand-500/15 text-brand-300',
  Mistake: 'border-red-500/40 bg-red-500/15 text-red-300',
  Foul: 'border-red-500/30 bg-red-500/10 text-red-300/80',
};
const TAG_DEFAULT = 'border-zinc-700 bg-zinc-800/60 text-zinc-300';

const fmtTime = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function FilmRoom() {
  const { workouts, pushError } = useApp();

  const [sessions, setSessions] = useState<api.FilmSession[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');

  // Editor state (one film session being tagged).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [workoutId, setWorkoutId] = useState<string>('none');
  const [tags, setTags] = useState<api.FilmTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => workouts.filter((w) => w.type === 'Match' || w.type === 'Team Training'),
    [workouts],
  );

  useEffect(() => {
    api.getFilmSessions().then(setSessions).catch(() => {});
  }, []);

  // Blob URLs hold the whole file mapping — release on swap/unmount.
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  const loadFile = (f: File | undefined) => {
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoName(f.name);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const addTag = (label: string) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.round(v.currentTime * 10) / 10;
    setTags((ts) => [...ts, { t, label, note: '' }].sort((a, b) => a.t - b.t));
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t - 3); // land a beat before the moment
    v.play().catch(() => {});
  };

  const setTagNote = (i: number, note: string) =>
    setTags((ts) => ts.map((tag, idx) => (idx === i ? { ...tag, note } : tag)));

  const removeTag = (i: number) => setTags((ts) => ts.filter((_, idx) => idx !== i));

  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setDate(todayISO());
    setWorkoutId('none');
    setTags([]);
    setVideoName('');
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: api.FilmSessionInput = {
        title: title.trim(),
        date,
        video_name: videoName,
        workout_id: workoutId === 'none' ? null : Number(workoutId),
        tags,
      };
      const saved = editingId
        ? await api.updateFilmSession(editingId, body)
        : await api.createFilmSession(body);
      setEditingId(saved.id);
      setSessions(await api.getFilmSessions());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not save film session');
    } finally {
      setSaving(false);
    }
  };

  const loadSession = (s: api.FilmSession) => {
    setEditingId(s.id);
    setTitle(s.title);
    setDate(s.date);
    setWorkoutId(s.workout_id ? String(s.workout_id) : 'none');
    setTags(s.tags);
    setVideoName(s.video_name);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null); // the file stays on disk — re-pick it to play
  };

  const removeSession = async (id: number) => {
    try {
      await api.deleteFilmSession(id);
      setSessions((ss) => ss.filter((s) => s.id !== id));
      if (editingId === id) resetEditor();
    } catch (e) {
      pushError(e instanceof Error ? e.message : 'Could not delete film session');
    }
  };

  return (
    <div className="space-y-4">
      {/* Player + tagging */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-brand-400" />
            {editingId ? 'Editing film session' : 'Tag a match video'}
          </CardTitle>
          <span className="text-xs text-zinc-500">
            The video never leaves your device — only your tags are saved.
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label="Choose match video"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />

          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-xl border border-zinc-800 bg-black"
            />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-zinc-400 transition-colors hover:border-brand-600/50 hover:text-zinc-200"
            >
              <Film className="h-10 w-10 text-brand-400/70" />
              <span className="text-sm font-medium">
                {videoName ? `Re-select “${videoName}” to play` : 'Choose a match video'}
              </span>
              <span className="text-xs text-zinc-600">
                MP4 / MOV / WebM — played straight from your disk
              </span>
            </button>
          )}

          {/* Tag buttons — hit one at the moment it happens */}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {TAG_LABELS.map((label) => (
              <button
                key={label}
                onClick={() => addTag(label)}
                disabled={!videoUrl}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:opacity-40 ${
                  TAG_COLORS[label] ?? TAG_DEFAULT
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Session meta + save */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="vs United — first half"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                aria-label="Film date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link to logged session</Label>
              <Select value={workoutId} onValueChange={setWorkoutId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {matches.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.date} · {m.title || m.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={save} disabled={saving || (!tags.length && !title.trim())} className="flex-1">
                {justSaved ? (
                  <>
                    <Check className="h-4 w-4" /> Saved
                  </>
                ) : saving ? (
                  'Saving…'
                ) : (
                  <>
                    <Save className="h-4 w-4" /> {editingId ? 'Update' : 'Save'}
                  </>
                )}
              </Button>
              {(editingId || tags.length > 0 || videoUrl) && (
                <Button variant="ghost" size="icon" onClick={resetEditor} title="New film session" aria-label="New film session">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Tag timeline */}
          {tags.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Timeline · {tags.length} tags</Label>
                <span className="text-[11px] text-zinc-600">Click a time to replay from 3s before</span>
              </div>
              {tags.map((tag, i) => (
                <div
                  key={`${tag.t}-${tag.label}-${i}`}
                  className="flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5"
                >
                  <button
                    onClick={() => seekTo(tag.t)}
                    disabled={!videoUrl}
                    className="w-12 shrink-0 rounded-md border border-zinc-700 bg-zinc-800/80 py-0.5 text-center text-xs tabular-nums text-brand-300 transition-colors enabled:hover:border-brand-600/50 disabled:opacity-50"
                    title="Jump to this moment"
                  >
                    {fmtTime(tag.t)}
                  </button>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                      TAG_COLORS[tag.label] ?? TAG_DEFAULT
                    }`}
                  >
                    {tag.label}
                  </span>
                  <Input
                    value={tag.note ?? ''}
                    onChange={(e) => setTagNote(i, e.target.value)}
                    placeholder="note…"
                    className="h-7 flex-1 border-transparent bg-transparent text-xs focus-visible:border-zinc-700"
                  />
                  <button
                    onClick={() => removeTag(i)}
                    className="text-zinc-600 transition-colors hover:text-red-400"
                    title="Remove tag"
                    aria-label="Remove tag"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved film sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Saved film sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessions.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nothing tagged yet. Load a match video above and hit the moment buttons as you watch.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                editingId === s.id
                  ? 'border-brand-600/40 bg-brand-600/10'
                  : 'border-zinc-800/60 bg-zinc-900/40'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/15 text-violet-300">
                <Film className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {s.title || s.video_name || 'Film session'}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {longDate(s.date)} · {s.tags.length} tags
                  {s.video_name ? ` · ${s.video_name}` : ''}
                </p>
              </div>
              <Badge variant="neutral" className="hidden sm:inline-flex">
                {summariseTags(s.tags)}
              </Badge>
              <Button variant="icon" size="icon" onClick={() => loadSession(s)} title="Open tags">
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button variant="icon" size="icon" onClick={() => removeSession(s.id)} title="Delete">
                <Trash2 className="h-4 w-4 text-red-400/80" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function summariseTags(tags: api.FilmTag[]): string {
  const counts: Record<string, number> = {};
  for (const t of tags) counts[t.label] = (counts[t.label] ?? 0) + 1;
  return (
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, n]) => `${label} ×${n}`)
      .join(' · ') || 'no tags'
  );
}
