import { useApp } from '@/context/AppContext';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { Dashboard } from '@/tabs/Dashboard';
import { LogWorkout } from '@/tabs/LogWorkout';
import { HistoryTab } from '@/tabs/History';
import { TrainingPlan } from '@/tabs/TrainingPlan';
import { Coach } from '@/tabs/Coach';
import { Nutrition } from '@/tabs/Nutrition';

export function Layout() {
  const { tab } = useApp();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-6xl">
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'log' && <LogWorkout />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'plan' && <TrainingPlan />}
            {tab === 'coach' && <Coach />}
            {tab === 'nutrition' && <Nutrition />}
          </div>
        </main>
      </div>
    </div>
  );
}
