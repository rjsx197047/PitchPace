// ─────────────────────────────────────────────────────────────────────────
// API client — one module owns every backend interaction.
//
// Paths are same-origin /api/*; Vite proxies them to FastAPI on :8000 in dev.
// The Claude key (set via Settings) is attached to AI requests, mirroring the
// pattern used by the other apps in this workspace. Keys live only in the
// browser's localStorage and travel per-request; nothing is stored server-side.
// ─────────────────────────────────────────────────────────────────────────

export const API_KEY_STORAGE = 'claude_api_key';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (key && key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim());
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* localStorage may be disabled (private mode) — ignore. */
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return req<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Types ───────────────────────────────────────────────────────────────

export type SportFocus = 'soccer' | 'track' | 'both';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface Profile {
  name: string;
  sport_focus: SportFocus;
  primary_event: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  experience: Experience;
  weekly_target: number;
  goals: string;
  /** Periodisation target — plans taper toward this. */
  target_event: string;
  target_event_date: string; // YYYY-MM-DD or ''
}

export interface Workout {
  id: number;
  date: string;
  type: string;
  title: string;
  duration_min: number;
  distance_mi: number;
  intensity: number;
  calories: number | null;
  metrics: Record<string, unknown>;
  notes: string;
  created_at: string;
  /** True when saved to the offline outbox, not yet synced to the server. */
  queued?: boolean;
}

export type WorkoutInput = Omit<Workout, 'id' | 'created_at'>;

export interface WeekPoint {
  week: string;
  label: string;
  minutes: number;
  distance: number;
  load: number;
  sessions: number;
}

export interface Stats {
  totals: {
    sessions: number;
    distance_mi: number;
    minutes: number;
    hours: number;
    avg_intensity: number;
  };
  this_week: {
    sessions: number;
    target: number;
    minutes: number;
    distance_mi: number;
    load: number;
  };
  load: {
    acute: number;
    chronic_weekly: number;
    acwr: number;
    status: 'no-data' | 'undertraining' | 'optimal' | 'caution' | 'high-risk';
  };
  streak_days: number;
  by_type: Record<string, number>;
  weeks: WeekPoint[];
}

export interface Health {
  status: string;
  app: string;
  ollama_available: boolean;
  workout_types: string[];
}

export interface ChatMsg {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface CoachResult {
  text: string;
  backend: 'claude' | 'ollama' | 'none';
}

// ── Endpoints ─────────────────────────────────────────────────────────────

export const getHealth = () => req<Health>('/api/health');

export const getProfile = () => req<Profile>('/api/profile');
export const updateProfile = (p: Partial<Profile>) =>
  req<Profile>('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });

export const getWorkouts = () =>
  req<{ workouts: Workout[] }>('/api/workouts').then((r) => r.workouts);

// ── Offline outbox ──────────────────────────────────────────────────────
// When a save fails because the network is down (PWA on the pitch), the
// workout is queued in localStorage and synced when the connection returns.

const OUTBOX_KEY = 'pp_outbox_v1';

function readOutbox(): WorkoutInput[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as WorkoutInput[];
  } catch {
    return [];
  }
}

function writeOutbox(list: WorkoutInput[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  } catch {
    /* storage full/disabled — nothing else we can do */
  }
}

export const outboxCount = (): number => readOutbox().length;

/** fetch() rejects with TypeError when the network itself is unreachable. */
const isNetworkError = (e: unknown): boolean => e instanceof TypeError;

/** Push queued workouts to the server; returns how many synced. */
export async function flushOutbox(): Promise<number> {
  const queue = readOutbox();
  if (!queue.length) return 0;
  let synced = 0;
  while (queue.length) {
    try {
      await postJson<Workout>('/api/workouts', queue[0]);
      synced++;
    } catch (e) {
      if (isNetworkError(e)) break; // still offline — try again later
      // Server rejected it (bad data): drop it rather than poison the queue.
    }
    queue.shift();
    writeOutbox(queue);
  }
  if (synced > 0) {
    window.dispatchEvent(new CustomEvent('pp:outbox-synced', { detail: { count: synced } }));
  }
  return synced;
}

export const createWorkout = async (w: WorkoutInput): Promise<Workout> => {
  try {
    return await postJson<Workout>('/api/workouts', w);
  } catch (e) {
    if (isNetworkError(e)) {
      writeOutbox([...readOutbox(), w]);
      window.dispatchEvent(new CustomEvent('pp:workout-queued'));
      return { ...w, id: -Date.now(), created_at: new Date().toISOString(), queued: true };
    }
    throw e;
  }
};

export const updateWorkout = (id: number, w: Partial<WorkoutInput>) =>
  req<Workout>(`/api/workouts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(w),
  });

export const deleteWorkout = (id: number) =>
  req<{ deleted: number }>(`/api/workouts/${id}`, { method: 'DELETE' });

export const getStats = () => req<Stats>('/api/stats');

// ── Readiness check-ins ─────────────────────────────────────────────────

export interface ReadinessScore {
  score: number;
  status: 'primed' | 'ready' | 'caution' | 'rest-day';
  components: Record<string, number>;
}

export interface Checkin {
  date: string;
  sleep_h: number;
  sleep_quality: number; // 1-5
  energy: number; // 1-5
  soreness: number; // 1-5 (5 = very sore)
  sore_areas: string[];
  resting_hr: number | null;
  hrv_ms: number | null;
  notes: string;
  created_at?: string;
  readiness?: ReadinessScore;
}

export type CheckinInput = Partial<Omit<Checkin, 'created_at' | 'readiness'>>;

export const getTodayCheckin = () =>
  req<{ checkin: Checkin | null }>('/api/checkin/today').then((r) => r.checkin);

export const saveCheckin = (c: CheckinInput) => postJson<Checkin>('/api/checkin', c);

// ── Quick-add: free text / voice → workout draft ────────────────────────

export const parseWorkoutText = (text: string) =>
  postJson<{ workout: WorkoutInput; backend: string }>('/api/workouts/parse-text', {
    text,
    api_key: getApiKey() ?? undefined,
  });

// ── Film Room (local match-video tagging) ───────────────────────────────

export interface FilmTag {
  t: number; // seconds into the video
  label: string;
  note?: string;
}

export interface FilmSession {
  id: number;
  date: string;
  title: string;
  video_name: string;
  workout_id: number | null;
  tags: FilmTag[];
  notes: string;
  created_at: string;
}

export type FilmSessionInput = Partial<Omit<FilmSession, 'id' | 'created_at'>>;

export const getFilmSessions = () =>
  req<{ sessions: FilmSession[] }>('/api/film').then((r) => r.sessions);

export const createFilmSession = (s: FilmSessionInput) =>
  postJson<FilmSession>('/api/film', s);

export const updateFilmSession = (id: number, s: FilmSessionInput) =>
  req<FilmSession>(`/api/film/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });

export const deleteFilmSession = (id: number) =>
  req<{ deleted: number }>(`/api/film/${id}`, { method: 'DELETE' });

// ── Encrypted device sync ───────────────────────────────────────────────

export interface SyncResult {
  workouts_added: number;
  checkins_added: number;
  film_added: number;
  skipped: number;
}

/** Download an encrypted .ppsync snapshot of everything. */
export async function syncExport(passphrase: string): Promise<void> {
  const res = await fetch('/api/sync/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      detail = (await res.json())?.detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pitchpace-${new Date().toISOString().slice(0, 10)}.ppsync`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const syncImport = (file: File, passphrase: string): Promise<SyncResult> => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('passphrase', passphrase);
  return req<SyncResult>('/api/sync/import', { method: 'POST', body: fd });
};

// ── Import (wearables / fitness apps) ───────────────────────────────────

export interface ImportParseResult {
  source: string;
  workouts: WorkoutInput[];
}

/** Parse a TCX / GPX / FIT / Apple Health file into workout drafts. */
export const parseImportFile = (file: File): Promise<ImportParseResult> => {
  const fd = new FormData();
  fd.append('file', file);
  // No Content-Type header — the browser sets the multipart boundary.
  return req<ImportParseResult>('/api/import/parse', { method: 'POST', body: fd });
};

// ── AI coach ────────────────────────────────────────────────────────────

export const getChat = () =>
  req<{ messages: ChatMsg[] }>('/api/chat').then((r) => r.messages);

export const clearChat = () => req<{ cleared: boolean }>('/api/chat', { method: 'DELETE' });

export const sendChat = (message: string) =>
  postJson<{ reply: string; backend: string; message: ChatMsg }>('/api/chat', {
    message,
    api_key: getApiKey() ?? undefined,
  });

const coach = (kind: 'plan' | 'nutrition' | 'recovery', focus?: string) =>
  postJson<CoachResult>(`/api/coach/${kind}`, {
    focus: focus || undefined,
    api_key: getApiKey() ?? undefined,
  });

export const coachPlan = (focus?: string) => coach('plan', focus);
export const coachNutrition = (focus?: string) => coach('nutrition', focus);
export const coachRecovery = (focus?: string) => coach('recovery', focus);
