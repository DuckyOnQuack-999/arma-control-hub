import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMetrics } from '@/lib/supabaseApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useAgentWebSocket } from '@/hooks/useAgentWebSocket';
import { Activity, Users, Cpu, MemoryStick } from 'lucide-react';

interface MetricData {
  timestamp: number;
  cpu: number;
  memory: number;
  player_count: number;
}

export default function MetricsTab({ serverId, agentUrl }: { serverId: number; agentUrl?: string | null }) {
  const { metrics: liveMetrics, connected } = useAgentWebSocket(agentUrl, serverId);
  const [timeRange, setTimeRange] = useState(1); // hours

  const { data: historicalMetrics = [], isLoading } = useQuery({
    queryKey: ['metrics', serverId, timeRange],
    queryFn: () => getMetrics(serverId, timeRange),
    refetchInterval: connected ? 30000 : 5000,
    enabled: !connected,
  });

  const allMetrics = connected && liveMetrics.length > 0
    ? liveMetrics.map((m: any) => ({
        timestamp: m.timestamp,
        cpu: m.cpu || 0,
        memory: m.memory || 0,
        player_count: m.playerCount || m.player_count || 0,
      }))
    : historicalMetrics.map((m: any) => ({
        timestamp: m.timestamp,
        cpu: m.cpu || 0,
        memory: m.memory || 0,
        player_count: m.player_count || 0,
      }));

  const chartData = allMetrics.map((m: MetricData) => ({
    time: new Date(m.timestamp).toLocaleTimeString(),
    cpu: Math.round(m.cpu * 100) / 100,
    memory: Math.round(m.memory * 100) / 100,
    players: m.player_count,
  }));

  const latest = allMetrics[allMetrics.length - 1] as MetricData | undefined;

  if (isLoading && !connected) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest ? `${latest.cpu}%` : 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest ? `${latest.memory} MB` : 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest ? latest.player_count : 'N/A'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {connected ? 'Live' : 'Polling'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>CPU & Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="cpu" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} name="CPU %" />
                  <Area type="monotone" dataKey="memory" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} name="Memory MB" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Player Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="players" fill="#2563eb" name="Players" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
