import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { ServerOverview } from './components/ServerOverview';
import { ServerDetail } from './components/ServerDetail';
import { Login, Register } from './pages/Auth';
import { useAuthStore } from './stores/authStore';
import { useServerStore } from './stores/serverStore';
import { useWebSocketStore } from './stores/websocketStore';

// Placeholder pages for routes not yet built
function BrowserPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-white">Server Browser</h2>
      <p className="text-gray-400">Browse public servers from the master list.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="p-4 bg-gray-800 rounded-lg border border-gray-700 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchesPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-white">Active Matches</h2>
      <p className="text-gray-400">View and manage ongoing matches across servers.</p>
      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <p className="text-gray-500">No active matches</p>
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-white">Settings</h2>
      <p className="text-gray-400">Configure your panel preferences.</p>
      <div className="space-y-6 max-w-2xl">
        <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-4">
          <h3 className="text-lg font-medium text-white">Profile</h3>
          <p className="text-gray-500">Profile settings coming soon.</p>
        </div>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  const { fetchServers } = useServerStore();
  const { connect } = useWebSocketStore();
  const { isAuthenticated } = useAuthStore();
  const [initialized, setInitialized] = useState(false);

  // Initialize WebSocket connection when authenticated
  useEffect(() => {
    if (isAuthenticated && !initialized) {
      connect?.();
      fetchServers?.();
      setInitialized(true);
    }
  }, [isAuthenticated, initialized, connect, fetchServers]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/servers" replace />} />
        <Route path="servers" element={<ServerOverview />} />
        <Route path="servers/:id" element={<ServerDetail />} />
        <Route path="browser" element={<BrowserPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;