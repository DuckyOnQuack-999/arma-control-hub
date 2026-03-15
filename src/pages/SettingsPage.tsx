import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserRoles, changeUserRole, deleteUserRole } from '@/lib/supabaseApi';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { UserRole } from '@/data/types';

const SettingsPage = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const { data: userRoles = [], isLoading } = useQuery({
    queryKey: ['user-roles'],
    queryFn: getUserRoles,
    enabled: user?.role === 'admin',
  });

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

  if (isLoading && user?.role === 'admin') return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold tracking-wide">Settings</h1>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-sm">Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{user?.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant="outline" className="text-xs">{user?.role}</Badge></div>
        </CardContent>
      </Card>

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
          <CardHeader>
            <CardTitle className="font-display text-sm">User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map(u => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="font-mono text-xs max-w-40 truncate">{u.user_id}</TableCell>
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

      <ConfirmDialog
        open={!!deleteUserId}
        onOpenChange={() => setDeleteUserId(null)}
        title="Remove User Role"
        description="Are you sure you want to remove this user's role? They will lose access."
        onConfirm={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
      />
    </div>
  );
};

export default SettingsPage;
