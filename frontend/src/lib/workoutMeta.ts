import {
  Trophy,
  Users,
  Zap,
  Footprints,
  Gauge,
  Dumbbell,
  Weight,
  PersonStanding,
  Swords,
  Target,
  Rabbit,
  HeartPulse,
  Bike,
  Activity,
  Timer,
  type LucideIcon,
} from 'lucide-react';

interface Meta {
  icon: LucideIcon;
  text: string; // text color class
  chip: string; // small chip bg/border
}

const MAP: Record<string, Meta> = {
  Match: { icon: Trophy, text: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  'Team Training': { icon: Users, text: 'text-brand-400', chip: 'bg-brand-500/15 text-brand-300 border-brand-500/25' },
  'Sprint / Track Session': { icon: Zap, text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'Distance Run': { icon: Footprints, text: 'text-teal-400', chip: 'bg-teal-500/15 text-teal-300 border-teal-500/25' },
  'Tempo Run': { icon: Gauge, text: 'text-cyan-400', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  'Strength & Power': { icon: Dumbbell, text: 'text-lime-400', chip: 'bg-lime-500/15 text-lime-300 border-lime-500/25' },
  Weightlifting: { icon: Weight, text: 'text-orange-400', chip: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
  Calisthenics: { icon: PersonStanding, text: 'text-violet-400', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
  'Technical / Ball Work': { icon: Target, text: 'text-green-400', chip: 'bg-green-500/15 text-green-300 border-green-500/25' },
  Plyometrics: { icon: Rabbit, text: 'text-sky-400', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
  'Recovery / Mobility': { icon: HeartPulse, text: 'text-zinc-300', chip: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25' },
  'Cross-Training': { icon: Bike, text: 'text-indigo-400', chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25' },
  Boxing: { icon: Swords, text: 'text-rose-400', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/25' },
  'Testing / Benchmarks': { icon: Timer, text: 'text-yellow-400', chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
};

const FALLBACK: Meta = {
  icon: Activity,
  text: 'text-brand-400',
  chip: 'bg-brand-500/15 text-brand-300 border-brand-500/25',
};

export function workoutMeta(type: string): Meta {
  return MAP[type] ?? FALLBACK;
}

/** RPE/intensity → label + color band. */
export function intensityMeta(rpe: number): { label: string; color: string } {
  if (rpe <= 3) return { label: 'Easy', color: 'text-sky-400' };
  if (rpe <= 5) return { label: 'Moderate', color: 'text-brand-400' };
  if (rpe <= 7) return { label: 'Hard', color: 'text-amber-400' };
  return { label: 'Max', color: 'text-red-400' };
}
