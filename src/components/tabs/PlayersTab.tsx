import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPlayers, getBans, kickPlayer, banPlayer, unban, serverAction } from '@/lib/supabaseApi';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from '@/hooks/use-toast';
import { Ban, VolumeX, UserX } from 'lucide-react';

export default function PlayersTab({ serverId }: { serverId: number }) {
  const queryClient = useQueryClient();
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState(60);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', serverId],
    queryFn: () => getPlayers(serverId),
    refetchInterval: 5000,
  });

  const { data: bans = [] } = useQuery({
    queryKey: ['bans', serverId],
    queryFn: () => getBans(serverId),
  });

  const handleKick = async () => {
    if (!kickTarget) return;
    await kickPlayer(serverId, kickTarget);
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
    toast({ title: 'Player kicked', description: `${kickTarget} has been kicked` });
    setKickTarget(null); setKickReason('');
  };

  const handleBan = async () => {
    if (!banTarget) return;
    await banPlayer(serverId, banTarget, banReason, banDuration);
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
    queryClient.invalidateQueries({ queryKey: ['bans', serverId] });
    toast({ title: 'Player banned', description: `${banTarget} has been banned` });
    setBanTarget(null); setBanReason(''); setBanDuration(60);
  };

  const handleUnban = async (banId: number) => {
    await unban(banId);
    queryClient.invalidateQueries({ queryKey: ['bans', serverId] });
    toast({ title: 'Player unbanned' });
  };

  const handleSilence = async (name: string) => {
    try {
      await serverAction(serverId, 'command', `SILENCE ${name}`);
      toast({ title: 'Player silenced', description: `${name} has been silenced` });
    } catch (err: any) {
      toast({ title: 'Silence failed', description: err?.message, variant: 'destructive' });
    }
  };

  const formatTime = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Tabs defaultValue="online">
      <TabsList className="bg-muted border border-border">
        <TabsTrigger value="online">Online ({players.length})</TabsTrigger>
        <TabsTrigger value="bans">Bans ({bans.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="online">
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Ping</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map(p => (
                <TableRow key={p.id} className="border-border">
                  <TableCell className="font-semibold">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.ip_address}</TableCell>
                  <TableCell className="text-right font-mono">{p.score}</TableCell>
                  <TableCell className="text-right">
                    <span className={p.ping < 50 ? 'text-neon-green' : p.ping < 100 ? 'text-neon-yellow' : 'text-neon-red'}>
                      {p.ping}ms
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatTime(p.joined_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setKickTarget(p.name)}>
                        <UserX className="h-3.5 w-3.5 text-neon-yellow" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBanTarget(p.name)}>
                        <Ban className="h-3.5 w-3.5 text-neon-red" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSilence(p.name)}>
                        <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {players.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No players online</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="bans">
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Player</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Banned By</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bans.map(b => (
                <TableRow key={b.id} className="border-border">
                  <TableCell className="font-semibold">{b.player_name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{b.ip_address}</TableCell>
                  <TableCell className="text-sm">{b.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{b.banned_by}</TableCell>
                  <TableCell className="text-xs">{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : 'Permanent'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-xs text-neon-green" onClick={() => handleUnban(b.id)}>Unban</Button>
                  </TableCell>
                </TableRow>
              ))}
              {bans.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No bans</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <Dialog open={!!kickTarget} onOpenChange={() => setKickTarget(null)}>
        <DialogContent className="border-border bg-card">
          <DialogHeader><DialogTitle className="font-display">Kick {kickTarget}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={kickReason} onChange={e => setKickReason(e.target.value)} placeholder="Reason for kick" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKickTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleKick}>Kick Player</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!banTarget} onOpenChange={() => setBanTarget(null)}>
        <DialogContent className="border-border bg-card">
          <DialogHeader><DialogTitle className="font-display">Ban {banTarget}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Reason</Label><Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Reason for ban" /></div>
            <div><Label>Duration (minutes, 0 = permanent)</Label><Input type="number" value={banDuration} onChange={e => setBanDuration(+e.target.value)} min={0} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBan}>Ban Player</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
