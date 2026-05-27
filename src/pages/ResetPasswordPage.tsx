import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Terminal, CircleCheck as CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast({ title: 'Password updated successfully' });
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      toast({ title: 'Failed to update password', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery && !success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background cyber-grid p-4">
        <Card className="relative z-10 w-full max-w-md border-primary/30 bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Invalid or expired reset link.</p>
            <Button variant="link" onClick={() => navigate('/login')} className="mt-2 text-primary">Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background cyber-grid p-4">
      <div className="fixed inset-0 scanline" />
      <Card className="relative z-10 w-full max-w-md border-primary/30 bg-card glow-cyan">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-primary/50 bg-primary/10">
            {success ? <CheckCircle className="h-7 w-7 text-success" /> : <Terminal className="h-7 w-7 text-primary" />}
          </div>
          <CardTitle className="font-display text-xl tracking-wider text-primary text-glow-cyan">
            {success ? 'PASSWORD UPDATED' : 'RESET PASSWORD'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <p className="text-center text-sm text-muted-foreground">Redirecting to login...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-body">New Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className="border-border bg-muted font-mono" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body">Confirm Password</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" className="border-border bg-muted font-mono" />
              </div>
              <Button type="submit" className="w-full font-display text-xs tracking-widest" disabled={loading}>
                {loading ? 'UPDATING...' : 'SET NEW PASSWORD'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
