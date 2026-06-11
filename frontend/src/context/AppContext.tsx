import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as api from '@/api/client';

export type View = 'home' | 'app';
export type TabKey =
  | 'dashboard'
  | 'log'
  | 'history'
  | 'plan'
  | 'coach'
  | 'nutrition';

interface Toast {
  id: number;
  message: string;
}

interface AppState {
  view: View;
  setView: (v: View) => void;
  tab: TabKey;
  setTab: (t: TabKey) => void;

  health: api.Health | null;
  profile: api.Profile | null;
  workouts: api.Workout[];
  stats: api.Stats | null;

  loading: boolean;
  refresh: () => Promise<void>;

  addWorkout: (w: api.WorkoutInput) => Promise<void>;
  addWorkouts: (list: api.WorkoutInput[]) => Promise<void>;
  editWorkout: (id: number, w: Partial<api.WorkoutInput>) => Promise<void>;
  removeWorkout: (id: number) => Promise<void>;
  saveProfile: (p: Partial<api.Profile>) => Promise<void>;

  toasts: Toast[];
  pushError: (message: string) => void;
  dismissToast: (id: number) => void;

  apiKeyPresent: boolean;
  refreshApiKeyState: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('home');
  const [tab, setTab] = useState<TabKey>('dashboard');

  const [health, setHealth] = useState<api.Health | null>(null);
  const [profile, setProfile] = useState<api.Profile | null>(null);
  const [workouts, setWorkouts] = useState<api.Workout[]>([]);
  const [stats, setStats] = useState<api.Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [apiKeyPresent, setApiKeyPresent] = useState<boolean>(!!api.getApiKey());

  const pushError = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const refreshApiKeyState = useCallback(() => {
    setApiKeyPresent(!!api.getApiKey());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s, p] = await Promise.all([
        api.getWorkouts(),
        api.getStats(),
        api.getProfile(),
      ]);
      setWorkouts(w);
      setStats(s);
      setProfile(p);
    } catch (e) {
      // A TypeError means the network is down — the offline outbox + service
      // worker handle that path; an error toast would just be noise.
      if (!(e instanceof TypeError)) {
        pushError(e instanceof Error ? e.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, [pushError]);

  // Initial load: health (for backend status) + data.
  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth(null));
    refresh();
  }, [refresh]);

  // Offline outbox lifecycle: flush queued workouts when the connection comes
  // back (and once at startup), and surface what happened as toasts.
  useEffect(() => {
    const tryFlush = () => {
      api.flushOutbox().catch(() => {});
    };
    const onQueued = () =>
      pushError(
        "You're offline — session saved on this device. It will sync automatically when you're back online.",
      );
    const onSynced = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      pushError(`Back online — synced ${count} queued session${count === 1 ? '' : 's'}.`);
      refresh();
    };
    window.addEventListener('online', tryFlush);
    window.addEventListener('pp:workout-queued', onQueued);
    window.addEventListener('pp:outbox-synced', onSynced);
    tryFlush();
    return () => {
      window.removeEventListener('online', tryFlush);
      window.removeEventListener('pp:workout-queued', onQueued);
      window.removeEventListener('pp:outbox-synced', onSynced);
    };
  }, [pushError, refresh]);

  const addWorkout = useCallback(
    async (w: api.WorkoutInput) => {
      try {
        await api.createWorkout(w);
        await refresh();
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Could not save workout');
        throw e;
      }
    },
    [refresh, pushError],
  );

  const addWorkouts = useCallback(
    async (list: api.WorkoutInput[]) => {
      try {
        for (const w of list) await api.createWorkout(w);
        await refresh();
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Could not save workouts');
        throw e;
      }
    },
    [refresh, pushError],
  );

  const editWorkout = useCallback(
    async (id: number, w: Partial<api.WorkoutInput>) => {
      try {
        await api.updateWorkout(id, w);
        await refresh();
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Could not update workout');
        throw e;
      }
    },
    [refresh, pushError],
  );

  const removeWorkout = useCallback(
    async (id: number) => {
      try {
        await api.deleteWorkout(id);
        await refresh();
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Could not delete workout');
      }
    },
    [refresh, pushError],
  );

  const saveProfile = useCallback(
    async (p: Partial<api.Profile>) => {
      try {
        const updated = await api.updateProfile(p);
        setProfile(updated);
        await refresh();
      } catch (e) {
        pushError(e instanceof Error ? e.message : 'Could not save profile');
        throw e;
      }
    },
    [refresh, pushError],
  );

  const value = useMemo<AppState>(
    () => ({
      view,
      setView,
      tab,
      setTab,
      health,
      profile,
      workouts,
      stats,
      loading,
      refresh,
      addWorkout,
      addWorkouts,
      editWorkout,
      removeWorkout,
      saveProfile,
      toasts,
      pushError,
      dismissToast,
      apiKeyPresent,
      refreshApiKeyState,
    }),
    [
      view,
      tab,
      health,
      profile,
      workouts,
      stats,
      loading,
      refresh,
      addWorkout,
      addWorkouts,
      editWorkout,
      removeWorkout,
      saveProfile,
      toasts,
      pushError,
      dismissToast,
      apiKeyPresent,
      refreshApiKeyState,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
