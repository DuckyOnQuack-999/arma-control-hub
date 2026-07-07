import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './stores/authStore';
import { ServerProvider } from './stores/serverStore';
import { WebSocketProvider } from './stores/websocketStore';
import { QueryProvider } from './lib/queryClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <BrowserRouter>
        <AuthProvider>
          <ServerProvider>
            <WebSocketProvider>
              <App />
            </WebSocketProvider>
          </ServerProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryProvider>
  </React.StrictMode>
);