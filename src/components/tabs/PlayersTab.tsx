import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPlayers, getBans, kickPlayer, banPlayer, unban } from '@/lib/supabaseApi';
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
  const [silenceTarget, setSilenceTarget] = useState<string | null>(null);
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
    const { error } = await kickPlayer(serverId, kickTarget, kickReason);
    if (error) {
      toast({ title: 'Kick Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Player kicked', description: `${kickTarget} has been kicked` });
    }
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
    setKickTarget(null); setKickReason('');
  };

  const handleBan = async () => {
    if (!banTarget) return;
    const { error } = await banPlayer(serverId, banTarget, banReason, banDuration);
    if (error) {
      toast({ title: 'Ban Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Player banned', description: `${banTarget} has been banned` });
    }
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
    queryClient.invalidateQueries({ queryKey: ['bans', serverId] });
    setBanTarget(null); setBanReason(''); setBanDuration(60);
  };

  const handleSilence = async () => {
    if (!silenceTarget) return;
    const { error } = await fetch(`/api/servers/${serverId}/players/${encodeURIComponent(silenceTarget)}/silence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json());
    if (error) {
      toast({ title: 'Silence Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Player silenced', description: `${silenceTarget} has been silenced` });
    }
    setSilenceTarget(null);
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
  };

  const handleUnban = async (name: string) => {
    const { error } = await unban(serverId, name);
    if (error) {
      toast({ title: 'Unban Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Player unbanned', description: `${name} has been unbanned` });
    }
    queryClient.invalidateQueries({ queryKey: ['bans', serverId] });
    queryClient.invalidateQueries({ queryKey: ['players', serverId] });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Tabs defaultValue="players" className="space-y-4">
      <TabsList>
        <TabsTrigger value="players">Online Players ({players.length})</TabsTrigger>
        <TabsTrigger value="bans">Bans ({bans.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="players">
        {players.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">No players online</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player: any) => (
                <TableRow key={player.name}>
                  <TableCell className="font-medium">{player.name}</TableCell>
                  <TableCell>{player.score || 0}</TableCell>
                  <TableCell>
                    {player.is_silenced && <span className="text-warning text-xs mr-2">Silenced</span>}
                    {player.is_banned && <span className="text-destructive text-xs">Banned</span>}
                    {!player.is_silenced && !player.is_banned && <span className="text-success text-xs">Active</span>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setKickTarget(player.name)}>
                      <UserX className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSilenceTarget(player.name)}>
                      <VolumeX className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setBanTarget(player.name)}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      <TabsContent value="bans">
        {bans.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">No active bans</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Banned By</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bans.map((ban: any) => (
                <TableRow key={ban.id}>
                  <TableCell className="font-medium">{ban.player_name}</TableCell>
                  <TableCell>{ban.reason || 'No reason'}</TableCell>
                  <TableCell>{ban.banned_by || 'System'}</TableCell>
                  <TableCell>
                    {ban.expires_at ? new Date(ban.expires_at).toLocaleString() : 'Permanent'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleUnban(ban.player_name)}>
                      Unban
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabsContent>

      {/* Kick Dialog */}
      <Dialog open={!!kickTarget} onOpenChange={() => { setKickTarget(null); setKickReason(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kick Player</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p>Are you sure you want to kick <strong>{kickTarget}</strong>?</p>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={kickReason} onChange={(e) => setKickReason(e.target.value)} placeholder="Reason for kick..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setKickTarget(null); setKickReason(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleKick}>Kick</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={!!banTarget} onOpenChange={() => { setBanTarget(null); setBanReason(''); setBanDuration(60); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ban Player</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p>Ban <strong>{banTarget}</strong></p>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason for ban..." />
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes, 0 = permanent)</Label>
              <Input type="number" value={banDuration} onChange={(e) => setBanDuration(parseInt(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBanTarget(null); setBanReason(''); setBanDuration(60); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleBan}>Ban</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silence Dialog */}
      <Dialog open={!!silenceTarget} onOpenChange={() => setSilenceTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Silence Player</DialogTitle></DialogHeader>
          <p>Silence <strong>{silenceTarget}</strong>? They will not be able to chat.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSilenceTarget(null)}>Cancel</Button>
            <Button onClick={handleSilence}>Silence</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
