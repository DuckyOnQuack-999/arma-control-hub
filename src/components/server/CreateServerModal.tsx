import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createServer, launchServer } from '@/lib/supabaseApi';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateServerModal({ open, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    executable_path: '/usr/bin/armagetronad-dedicated',
    data_dir: '/usr/share/armagetronad',
    config_dir: '/etc/armagetronad/new',
    port: 4534,
    max_players: 16,
    auto_restart: true,
    agent_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || form.name.length < 3) {
      toast({ title: 'Validation Error', description: 'Name must be at least 3 characters', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const server = await createServer(form);
      toast({ title: 'Server created', description: `${form.name} has been added` });

      // Auto-launch if agent is configured
      if (form.agent_url) {
        setLaunching(true);
        try {
          const result = await launchServer(server.id);
          toast({ title: 'Server launched', description: result.message });
        } catch (err: any) {
          toast({
            title: 'Launch failed',
            description: `Server created but launch failed: ${err?.message}. You can retry from the Overview tab.`,
            variant: 'destructive',
          });
        } finally {
          setLaunching(false);
        }
      } else {
        toast({
          title: 'No agent configured',
          description: 'Set up a host agent for real server control',
          action: <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate('/agent-wizard')}>Setup Agent</Button>,
        });
      }

      onCreated();
      onClose();
      setForm({ name: '', executable_path: '/usr/bin/armagetronad-dedicated', data_dir: '/usr/share/armagetronad', config_dir: '/etc/armagetronad/new', port: 4534, max_players: 16, auto_restart: true, agent_url: '' });
    } catch (err: any) {
      toast({ title: 'Failed to create server', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isWorking = loading || launching;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isWorking && onClose()}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Add Server</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Server Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Server" />
          </div>
          <div className="grid gap-1.5">
            <Label>Executable Path</Label>
            <Input value={form.executable_path} onChange={e => setForm(f => ({ ...f, executable_path: e.target.value }))} className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data Directory</Label>
              <Input value={form.data_dir} onChange={e => setForm(f => ({ ...f, data_dir: e.target.value }))} className="font-mono text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label>Config Directory</Label>
              <Input value={form.config_dir} onChange={e => setForm(f => ({ ...f, config_dir: e.target.value }))} className="font-mono text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Port</Label>
              <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: +e.target.value }))} min={1024} max={65535} />
            </div>
            <div className="grid gap-1.5">
              <Label>Max Players</Label>
              <Input type="number" value={form.max_players} onChange={e => setForm(f => ({ ...f, max_players: +e.target.value }))} min={2} max={32} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.auto_restart} onCheckedChange={v => setForm(f => ({ ...f, auto_restart: v }))} />
            <Label>Auto-restart on crash</Label>
          </div>
          <div className="grid gap-1.5">
            <Label>Agent URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <div className="flex gap-2">
              <Input value={form.agent_url} onChange={e => setForm(f => ({ ...f, agent_url: e.target.value }))} placeholder="http://192.168.1.10:8080" className="font-mono text-xs flex-1" />
              <Button type="button" variant="outline" size="sm" className="text-xs shrink-0" onClick={() => setForm(f => ({ ...f, agent_url: 'http://127.0.0.1:8080' }))}>
                Localhost
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              HTTP endpoint of the host agent. Leave empty for simulation mode.
              {form.agent_url && ' Server will be auto-launched on the agent after creation.'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isWorking}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isWorking}>
            {launching ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Launching…</> :
             loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> :
             form.agent_url ? 'Create & Launch' : 'Create Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
