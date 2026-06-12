import {
  LayoutDashboard,
  PlusCircle,
  History,
  Clapperboard,
  CalendarRange,
  MessageSquareText,
  Salad,
  type LucideIcon,
} from 'lucide-react';
import type { TabKey } from '@/context/AppContext';

export interface NavItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Load, trends & training balance at a glance',
  },
  {
    key: 'log',
    label: 'Log Workout',
    icon: PlusCircle,
    description: 'Record a session — match, track, gym or recovery',
  },
  {
    key: 'history',
    label: 'History',
    icon: History,
    description: 'Browse, edit and review every session',
  },
  {
    key: 'film',
    label: 'Film Room',
    icon: Clapperboard,
    description: 'Tag match film — the video never leaves your device',
  },
  {
    key: 'plan',
    label: 'Training Plan',
    icon: CalendarRange,
    description: 'AI-built weekly plan tuned to your load',
  },
  {
    key: 'coach',
    label: 'AI Coach',
    icon: MessageSquareText,
    description: 'Chat for advice, workouts & game prep',
  },
  {
    key: 'nutrition',
    label: 'Nutrition & Recovery',
    icon: Salad,
    description: 'Fuelling and recovery built around your week',
  },
];
