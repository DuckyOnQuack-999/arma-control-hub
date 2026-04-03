import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserRoles, changeUserRole, deleteUserRole, getProfiles, getAuditLog, changePassword, updateProfile, getBinaryDownloadUrl } from '@/lib/supabaseApi';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2, Key, Shield, Clock, Info, Download, Server, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import type { UserRole } from '@/data/types';

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const isAdmin = user?.role === 'admin';

  const { data: userRoles = [], isLoading } = useQuery({
    queryKey: ['user-roles'],
    queryFn: getUserRoles,
    enabled: isAdmin,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    enabled: isAdmin,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getAuditLog(25),
    enabled: isAdmin,
  });

  // Build a map of user_id -> email from profiles
  const emailMap = new Map(profiles.map(p => [p.id, p.email || p.id]));

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => changeUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast({ title: 'Role updated' });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUserRole(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast({ title: 'User role removed' });
      setDeleteUserId(null);
    },
  });

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'Password too short', description: 'Minimum 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    try {
      await changePassword(newPassword);
      toast({ title: 'Password changed successfully' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleDisplayNameUpdate = async () => {
    if (!displayName.trim() || !user) return;
    try {
      await updateProfile(user.id, { display_name: displayName.trim() });
      toast({ title: 'Display name updated' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  if (isLoading && isAdmin) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold tracking-wide">Settings</h1>

      {/* Account */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{user?.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant="outline" className="text-xs">{user?.role}</Badge></div>
          <div className="pt-2 space-y-2">
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <div className="flex gap-2">
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Enter display name" className="h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={handleDisplayNameUpdate} disabled={!displayName.trim()}>Save</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Change */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-sm flex items-center gap-2"><Key className="h-4 w-4" /> Change Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" className="h-8 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" className="h-8 text-sm" />
          </div>
          <Button size="sm" onClick={handlePasswordChange} disabled={!newPassword || !confirmPassword}>Update Password</Button>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-sm">App Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive alerts for server events</p>
            </div>
            <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Agent Setup (admin only) */}
      {isAdmin && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-sm flex items-center gap-2"><Server className="h-4 w-4" /> Host Agent Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs text-muted-foreground">
                To control real Armagetron servers, run a <strong>host agent</strong> on each machine hosting game servers. The agent manages the <code className="text-primary">armagetronad-dedicated</code> process and responds to commands from this panel.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label className="text-xs font-display">1. Download Binaries</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => window.open(getBinaryDownloadUrl('armagetronad-dedicated'), '_blank')}>
                  <Download className="h-3 w-3 mr-1" /> armagetronad-dedicated
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => window.open(getBinaryDownloadUrl('armagetronad-serverquery'), '_blank')}>
                  <Download className="h-3 w-3 mr-1" /> armagetronad-serverquery
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display">2. Setup Agent</Label>
              <div className="rounded-md bg-muted p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                <p># Place binaries on your game server host:</p>
                <p>chmod +x armagetronad-dedicated armagetronad-serverquery</p>
                <p>mv armagetronad-* /usr/local/bin/</p>
                <p className="pt-2"># Run the agent (Node.js example):</p>
                <p>npx retrocycles-agent --port 8080</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display">3. Connect</Label>
              <p className="text-xs text-muted-foreground">
                Set the <strong>Agent URL</strong> when creating/editing a server (e.g. <code className="text-primary">http://192.168.1.10:8080</code>). The panel proxies all actions to the agent instead of simulating.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-display">Agent API Spec</Label>
              <div className="rounded-md bg-muted p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                <p>POST /control — {"{"} action, serverId, command? {"}"}</p>
                <p>POST /status  — {"{"} serverId {"}"}</p>
                <p>Returns: {"{"} status, player_count, cpu_percent, memory_mb, current_map, uptime {"}"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Management (admin only) */}
      {isAdmin && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-sm">User Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs text-muted-foreground">
                New users must register themselves via the login page. Once registered, their role can be changed below. First user is automatically assigned <strong>admin</strong>; subsequent users default to <strong>viewer</strong>.
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map(u => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="text-xs">
                      <div>{emailMap.get(u.user_id) || 'Unknown'}</div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-40">{u.user_id}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={v => changeRoleMutation.mutate({ userId: u.user_id, role: v as UserRole })}
                        disabled={u.user_id === user?.id}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="moderator">Moderator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        disabled={u.user_id === user?.id}
                        onClick={() => setDeleteUserId(u.user_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Audit Log (admin only) */}
      {isAdmin && auditLog.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Audit Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 text-xs border-b border-border pb-2 last:border-0">
                  <span className="text-muted-foreground shrink-0 w-32">{new Date(entry.created_at).toLocaleString()}</span>
                  <span className="font-mono text-primary">{entry.action}</span>
                  <span className="text-muted-foreground truncate">{emailMap.get(entry.user_id) || entry.user_id?.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteUserId}
        onOpenChange={() => setDeleteUserId(null)}
        title="Remove User Role"
        description="Are you sure you want to remove this user's role? They will lose access."
        destructive
        onConfirm={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
      />
    </div>
  );
};

export default SettingsPage;
