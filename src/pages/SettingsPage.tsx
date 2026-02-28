import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { UserRole } from '@/data/types';

const SettingsPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) => api.changeUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Role updated' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User deleted' });
      setDeleteUserId(null);
    },
  });

  const addUserMutation = useMutation({
    mutationFn: () => api.addUser(newUsername, newPassword, newRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User created' });
      setShowAddUser(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold tracking-wide">Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-sm">Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>{user?.username}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant="outline" className="text-xs">{user?.role}</Badge></div>
        </CardContent>
      </Card>

      {/* App Settings */}
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

      {user?.role === 'admin' && (
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-display text-sm">User Management</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddUser(!showAddUser)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Add User
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {showAddUser && (
              <div className="rounded-md border border-border bg-muted/50 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Username</Label>
                    <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Password</Label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Select value={newRole} onValueChange={v => setNewRole(v as UserRole)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => addUserMutation.mutate()} disabled={!newUsername.trim() || !newPassword.trim()}>
                    Create User
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddUser(false)}>Cancel</Button>
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="font-semibold">{u.username}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={v => changeRoleMutation.mutate({ userId: u.id, role: v as UserRole })}
                        disabled={u.id === user?.id}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(u.createdAt * 1000).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={u.id === user?.id}
                        onClick={() => setDeleteUserId(u.id)}
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

      <ConfirmDialog
        open={!!deleteUserId}
        onOpenChange={() => setDeleteUserId(null)}
        title="Delete User"
        description="Are you sure you want to delete this user? This cannot be undone."
        onConfirm={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
      />
    </div>
  );
};

export default SettingsPage;
