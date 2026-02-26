import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Terminal } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch {
      toast({ title: 'Login failed', description: 'Invalid credentials', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background cyber-grid p-4">
      <div className="fixed inset-0 scanline" />
      <Card className="relative z-10 w-full max-w-md border-primary/30 bg-card glow-cyan">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-primary/50 bg-primary/10">
            <Terminal className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="font-display text-xl tracking-wider text-primary text-glow-cyan">
            RETROCYCLES PANEL
          </CardTitle>
          <p className="text-sm text-muted-foreground font-body">
            Armagetron Server Control
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-body">Username</Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                className="border-border bg-muted font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-body">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="border-border bg-muted font-mono"
              />
            </div>
            <Button type="submit" className="w-full font-display text-xs tracking-widest" disabled={loading}>
              {loading ? 'AUTHENTICATING...' : 'ACCESS GRID'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo: enter any username to login
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
