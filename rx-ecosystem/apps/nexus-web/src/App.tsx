import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, ServerOverview, ServerDetail } from './components';
import { Login, Register } from './pages/Auth';
import { useAuthStore } from './stores/authStore';
import { useServerStore } from './stores/serverStore';
import { useWebSocketStore } from './stores/websocketStore';

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
      connect();
      fetchServers();
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
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/servers" replace />} />
                <Route path="/servers" element={<ServerOverview />} />
                <Route path="/servers/:id" element={<ServerDetail />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;