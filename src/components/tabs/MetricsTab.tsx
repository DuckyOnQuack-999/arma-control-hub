import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Cpu, HardDrive, Users } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ranges = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export default function MetricsTab({ serverId }: { serverId: number }) {
  const [range, setRange] = useState(24);

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['metrics', serverId, range],
    queryFn: () => api.getMetrics(serverId, range),
  });

  if (isLoading) return <LoadingSpinner />;

  // Downsample for chart performance
  const step = Math.max(1, Math.floor(metrics.length / 200));
  const chartData = metrics.filter((_, i) => i % step === 0).map(m => ({
    ...m,
    time: new Date(m.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  const latest = metrics[metrics.length - 1];

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        {ranges.map(r => (
          <Button key={r.label} size="sm" variant={range === r.hours ? 'default' : 'outline'} onClick={() => setRange(r.hours)}
            className="text-xs font-mono">
            {r.label}
          </Button>
        ))}
      </div>

      {/* Live stats */}
      {latest && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <Cpu className="h-8 w-8 text-neon-red" />
              <div>
                <div className="text-2xl font-display font-bold">{latest.cpu.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">CPU Usage</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <HardDrive className="h-8 w-8 text-neon-blue" />
              <div>
                <div className="text-2xl font-display font-bold">{latest.memory.toFixed(0)} MB</div>
                <div className="text-xs text-muted-foreground">Memory</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="h-8 w-8 text-neon-green" />
              <div>
                <div className="text-2xl font-display font-bold">{latest.players}</div>
                <div className="text-xs text-muted-foreground">Players</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* CPU Chart */}
          <Card className="border-border bg-card p-4">
            <h3 className="font-display text-sm mb-3">CPU Usage (%)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(240 14% 9%)', border: '1px solid hsl(240 10% 18%)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="cpu" stroke="hsl(0 100% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Memory Chart */}
          <Card className="border-border bg-card p-4">
            <h3 className="font-display text-sm mb-3">Memory (MB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(240 14% 9%)', border: '1px solid hsl(240 10% 18%)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="memory" stroke="hsl(220 100% 60%)" fill="hsl(220 100% 60% / 0.2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Player Count Chart */}
          <Card className="border-border bg-card p-4">
            <h3 className="font-display text-sm mb-3">Player Count</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 10% 18%)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(240 14% 9%)', border: '1px solid hsl(240 10% 18%)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="players" fill="hsl(110 100% 62% / 0.7)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-12">No metrics data available for this server</div>
      )}
    </div>
  );
}
