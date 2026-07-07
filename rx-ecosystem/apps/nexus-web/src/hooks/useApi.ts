import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import type { ServerInstance, ServerConfig, Player, Match, LogEvent, ResourceUsage } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getAuthHeaders = () => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Server API hooks
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchWithAuth(`${API_URL}/api/servers`),
    refetchInterval: 5000,
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: ['server', id],
    queryFn: () => fetchWithAuth(`${API_URL}/api/servers/${id}`),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: ServerConfig) => fetchWithAuth(`${API_URL}/api/servers`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });
}

export function useStartServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`${API_URL}/api/servers/${id}/start`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['server', id] });
    },
  });
}

export function useStopServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`${API_URL}/api/servers/${id}/stop`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['server', id] });
    },
  });
}

export function useRestartServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`${API_URL}/api/servers/${id}/restart`, { method: 'POST' }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['server', id] });
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchWithAuth(`${API_URL}/api/servers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });
}

export function useExecuteCommand() {
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: string }) => 
      fetchWithAuth(`${API_URL}/api/servers/${id}/command`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      }),
  });
}

export function useServerLogs(id: string) {
  return useQuery({
    queryKey: ['server', id, 'logs'],
    queryFn: () => fetchWithAuth(`${API_URL}/api/servers/${id}/logs`),
    enabled: !!id,
    refetchInterval: 2000,
  });
}

export function useServerConfig(id: string) {
  return useQuery({
    queryKey: ['server', id, 'config'],
    queryFn: () => fetchWithAuth(`${API_URL}/api/servers/${id}/config`),
    enabled: !!id,
  });
}

export function useUpdateServerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => 
      fetchWithAuth(`${API_URL}/api/servers/${id}/config`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['server', id, 'config'] });
    },
  });
}

// Match API hooks
export function useServerMatches(id: string) {
  return useQuery({
    queryKey: ['server', id, 'matches'],
    queryFn: () => fetchWithAuth(`${API_URL}/api/servers/${id}/matches`),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useStartMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: 'SUMO' | 'CTF' | 'RACE' }) => 
      fetchWithAuth(`${API_URL}/api/servers/${id}/matches`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['server', id, 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['server', id] });
    },
  });
}

export function useEndMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => fetchWithAuth(`${API_URL}/api/matches/${matchId}/end`, { method: 'POST' }),
    onSuccess: (_, matchId) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

// Admin commands
export function useAdminCommands() {
  return useQuery({
    queryKey: ['admin', 'commands'],
    queryFn: () => fetchWithAuth(`${API_URL}/api/commands`),
  });
}

export function useBatchCommand() {
  return useMutation({
    mutationFn: ({ serverIds, command }: { serverIds: string[]; command: string }) => 
      fetchWithAuth(`${API_URL}/api/servers/commands/batch`, {
        method: 'POST',
        body: JSON.stringify({ serverIds, command }),
      }),
  });
}

// Auth hooks
export function useLogin() {
  const { setAuth } = useAuthStore();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => 
      fetchWithAuth(`${API_URL}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    onSuccess: (data) => {
      setAuth(data.user, data.token);
    },
  });
}

export function useRegister() {
  const { setAuth } = useAuthStore();
  return useMutation({
    mutationFn: ({ username, email, password }: { username: string; email: string; password: string }) => 
      fetchWithAuth(`${API_URL}/api/auth/register`, {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
    onSuccess: (data) => {
      setAuth(data.user, data.token);
    },
  });
}