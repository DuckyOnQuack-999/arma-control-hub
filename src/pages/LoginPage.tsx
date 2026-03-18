import { useState, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Terminal } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const LoginPage = forwardRef<HTMLDivElement>((_, ref) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (isRegister && password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password);
        toast({ title: 'Account created', description: 'Check your email to confirm, or log in if auto-confirm is enabled.' });
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: isRegister ? 'Registration failed' : 'Login failed', description: err?.message || 'Invalid credentials', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={ref} className="flex min-h-screen items-center justify-center bg-background cyber-grid p-4">
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
          <div className="flex rounded-md border border-border mb-4 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsRegister(false)}
              className={`flex-1 py-2 text-xs font-display tracking-wider transition-colors ${!isRegister ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className={`flex-1 py-2 text-xs font-display tracking-wider transition-colors ${isRegister ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              REGISTER
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-body">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
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
            {isRegister && (
              <div className="space-y-1.5">
                <Label className="font-body">Confirm Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="border-border bg-muted font-mono"
                />
              </div>
            )}
            <Button type="submit" className="w-full font-display text-xs tracking-widest" disabled={loading}>
              {loading ? (isRegister ? 'CREATING...' : 'AUTHENTICATING...') : (isRegister ? 'CREATE ACCOUNT' : 'ACCESS GRID')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {isRegister ? 'First user becomes admin automatically' : 'Sign in with your email and password'}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
