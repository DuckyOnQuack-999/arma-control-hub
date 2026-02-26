import { useQuery } from '@tanstack/react-query';
import { api } from '@/data/mockApi';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const SettingsPage = () => {
  const { user } = useAuthStore();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
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

      {user?.role === 'admin' && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display text-sm">User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className="border-border">
                    <TableCell className="font-semibold">{u.username}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{u.role}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{new Date(u.createdAt * 1000).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;
