import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Server, Users, Cpu, HardDrive, Wifi, Clock, Wand as Wand2, Globe, Settings, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServerCard } from '@/components/server/ServerCard';
import { CreateServerModal } from '@/components/server/CreateServerModal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useServerStore } from '@/stores/serverStore';
import { getServers, getRecentEventsAll } from '@/lib/supabaseApi';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  online: 'hsl(var(--success))',
  offline: 'hsl(var(--muted-foreground))',
  crashed: 'hsl(var(--destructive))',
  starting: 'hsl(var(--warning))',
};

const DashboardPage = () => {
  const [showCreate, setShowCreate] = useState(false);
  const { servers, setServers } = useServerStore();
  const navigate = useNavigate();

  const { isLoading, refetch } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const data = await getServers();
      setServers(data);
      return data;
    },
  });

  const { data: recentEvents = [] } = useQuery({
    queryKey: ['recent-events-all'],
    queryFn: () => getRecentEventsAll(5),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('servers-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const onlineCount = servers.filter(s => s.status === 'online').length;
  const totalPlayers = servers.reduce((sum, s) => sum + (s.player_count ?? 0), 0);
  const avgCpu = servers.length > 0 ? servers.reduce((sum, s) => sum + (s.cpu_percent ?? 0), 0) / servers.length : 0;
  const totalMemory = servers.reduce((sum, s) => sum + (s.memory_mb ?? 0), 0);
  const agentCount = servers.filter(s => s.agent_url).length;
  const totalUptime = servers.reduce((sum, s) => sum + (s.uptime ?? 0), 0);

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600);
    return d > 0 ? `${d}d ${h}h` : `${h}h`;
  };

  if (isLoading && servers.length === 0) return <LoadingSpinner />;

  const stats = [
    { icon: Server, label: 'Servers Online', value: `${onlineCount} / ${servers.length}`, color: 'text-success' },
    { icon: Users, label: 'Total Players', value: String(totalPlayers), color: 'text-primary' },
    { icon: Cpu, label: 'Avg CPU', value: `${avgCpu.toFixed(1)}%`, color: 'text-destructive' },
    { icon: HardDrive, label: 'Total Memory', value: `${totalMemory.toFixed(0)} MB`, color: 'text-info' },
    { icon: Wifi, label: 'Agent Connected', value: `${agentCount} / ${servers.length}`, color: 'text-warning' },
    { icon: Clock, label: 'Total Uptime', value: formatUptime(totalUptime), color: 'text-primary' },
  ];

  // Pie chart data
  const statusCounts: Record<string, number> = {};
  servers.forEach(s => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Bar chart data
  const barData = servers.map(s => ({ name: s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name, players: s.player_count, max: s.max_players }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-wide text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground font-body">
            {onlineCount} servers online · {totalPlayers} players connected
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Server
        </Button>
      </div>

      {/* Stats Widgets */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(stat => (
          <Card key={stat.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <stat.icon className={`h-6 w-6 ${stat.color} shrink-0`} />
              <div>
                <div className="text-lg font-display font-bold">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts & Activity Row */}
      {servers.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Status Distribution */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Server Health</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={35} paddingAngle={2}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#666'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
              <div className="space-y-1 ml-3">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[d.name] || '#666' }} />
                    <span className="capitalize text-muted-foreground">{d.name}</span>
                    <span className="font-bold text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Player Distribution */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Player Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={barData} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="players" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent events</p>
              ) : (
                <div className="space-y-2">
                  {recentEvents.map(ev => (
                    <div key={ev.id} className="flex items-start gap-2 text-xs border-b border-border pb-1.5 last:border-0">
                      <span className="text-muted-foreground shrink-0 w-14">{new Date(ev.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="font-mono text-primary">{ev.event_type}</span>
                      <span className="text-muted-foreground truncate">{(ev as any).server_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate('/host-settings')}>
          <Wand2 className="h-3 w-3 mr-1" /> Host Settings
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate('/browser')}>
          <Globe className="h-3 w-3 mr-1" /> Server Browser
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate('/settings')}>
          <Settings className="h-3 w-3 mr-1" /> Settings
        </Button>
      </div>

      {/* Server Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map(server => (
          <ServerCard key={server.id} server={server} />
        ))}
      </div>

      {servers.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground mb-4">No servers configured yet</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Your First Server
          </Button>
        </div>
      )}

      <CreateServerModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />
    </div>
  );
};

export default DashboardPage;
