import { AppProvider, useApp } from '@/context/AppContext';
import { Home } from '@/components/Home';
import { Layout } from '@/components/Layout';
import { ErrorToasts } from '@/components/ErrorToast';

function Shell() {
  const { view } = useApp();
  return view === 'home' ? <Home /> : <Layout />;
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
      <ErrorToasts />
    </AppProvider>
  );
}
