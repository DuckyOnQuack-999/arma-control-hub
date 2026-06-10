import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createServer, serverAction, saveConfig } from '@/lib/supabaseApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Loader as Loader2, ChevronDown, ChevronUp, FileText, Play } from 'lucide-react';

// Config templates
const CONFIG_TEMPLATES = {
  default: {
    name: 'Default Racing',
    description: 'Standard racing configuration',
    config: `SERVER_NAME My Server
TALK_TO_MASTER 1
MESSAGE_OF_DAY Welcome to my server!
MAX_PLAYERS 16
CYCLE_SPEED 20
CYCLE_BOOST 10
SIZE_FACTOR 1.5
WAIT_FOR_PLAYERS 5`,
  },
  fortress: {
    name: 'Fortress',
    description: 'Team-based fortress mode',
    config: `SERVER_NAME Fortress Server
TALK_TO_MASTER 1
GAME_TYPE 1
FORTRESS_CONQUER_TIME 0.5
FORTRESS_DEFEND_RATE 0.3
MAX_PLAYERS 16
CYCLE_SPEED 30
CYCLE_BOOST 15`,
  },
  sumo: {
    name: 'Sumo',
    description: 'Sumo bar mode',
    config: `SERVER_NAME Sumo Server
TALK_TO_MASTER 1
GAME_TYPE 2
SUMO_SCORE_TIME 1
CYCLE_SPEED 25
CYCLE_RIBBON_TIME 15
CYCLE_BOOST 10`,
  },
  racing: {
    name: 'High Speed Racing',
    description: 'Fast paced racing',
    config: `SERVER_NAME Racing Server
TALK_TO_MASTER 1
CYCLE_SPEED 30
CYCLE_BOOST 20
CYCLE_BOOST_MAX 40
CYCLE_START_SPEED 20
SIZE_FACTOR 2
ZONE_VELO 4`,
  },
  custom: {
    name: 'Custom',
    description: 'Blank configuration for custom setup',
    config: `SERVER_NAME My Server
TALK_TO_MASTER 1`,
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateServerModal({ open, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [template, setTemplate] = useState('default');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customConfig, setCustomConfig] = useState(CONFIG_TEMPLATES.default.config);

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

  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    setCustomConfig(CONFIG_TEMPLATES[value as keyof typeof CONFIG_TEMPLATES].config);
  };

  const parseConfigToKeyValue = (configText: string): Record<string, string> => {
    const result: Record<string, string> = {};
    configText.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx > 0) {
        const key = trimmed.substring(0, spaceIdx);
        const value = trimmed.substring(spaceIdx + 1);
        result[key] = value;
      }
    });
    return result;
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || form.name.length < 3) {
      toast({ title: 'Validation Error', description: 'Name must be at least 3 characters', variant: 'destructive' });
      return;
    }
    if (!form.port || form.port < 1024 || form.port > 65535) {
      toast({ title: 'Validation Error', description: 'Port must be between 1024 and 65535', variant: 'destructive' });
      return;
    }

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please log in to create a server', variant: 'destructive' });
      return;
    }

    setLoading(true);
    let server: any = null;
    try {
      server = await createServer(form);
    } catch (err: any) {
      console.error('Create server error:', err);
      toast({ title: 'Failed to create server', description: err?.message || 'Unknown error', variant: 'destructive' });
      setLoading(false);
      return;
    }

    if (!server || !server.id) {
      toast({ title: 'Failed to create server', description: 'Server was not created', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Create default config files in database
    const configData = parseConfigToKeyValue(customConfig);
    configData['PORT'] = String(form.port);
    configData['MAX_PLAYERS'] = String(form.max_players);
    if (!configData['SERVER_NAME']) {
      configData['SERVER_NAME'] = form.name;
    }

    try {
      await saveConfig(server.id, configData);
    } catch (cfgErr: any) {
      console.warn('Failed to save initial config:', cfgErr);
      toast({ title: 'Warning', description: `Server created but config save failed: ${cfgErr?.message}`, variant: 'destructive' });
    }

    // Auto-start if agent is configured
    if (form.agent_url) {
      setLaunching(true);
      try {
        const result = await serverAction(server.id, 'start');
        toast({ title: 'Server started', description: result.message });
      } catch (err: any) {
        toast({
          title: 'Start failed',
          description: `Server created but start failed: ${err?.message}. You can retry from the Overview tab.`,
          variant: 'destructive',
        });
      } finally {
        setLaunching(false);
      }
    } else {
      toast({
        title: 'Server created',
        description: 'Configure a host agent for remote process control, or manage directly from the panel.',
        action: <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate('/host-settings')}>Host Settings</Button>,
      });
    }

    onCreated();
    onClose();
    // Reset form
    setForm({ name: '', executable_path: '/usr/bin/armagetronad-dedicated', data_dir: '/usr/share/armagetronad', config_dir: '/etc/armagetronad/new', port: 4534, max_players: 16, auto_restart: true, agent_url: '' });
    setTemplate('default');
    setCustomConfig(CONFIG_TEMPLATES.default.config);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Configuration Template</Label>
            <Select value={template} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONFIG_TEMPLATES).map(([key, t]) => (
                  <SelectItem key={key} value={key}>
                    {t.name} — {t.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Basic Info */}
          <div className="space-y-2">
            <Label>Server Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Racing Server"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Port</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 4534 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Players</Label>
              <Input
                type="number"
                value={form.max_players}
                onChange={(e) => setForm({ ...form, max_players: parseInt(e.target.value) || 16 })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.auto_restart}
              onCheckedChange={(v) => setForm({ ...form, auto_restart: v })}
            />
            <Label>Auto-restart on crash</Label>
          </div>

          {/* Agent URL */}
          <div className="space-y-2">
            <Label>Agent URL (optional)</Label>
            <Input
              value={form.agent_url}
              onChange={(e) => setForm({ ...form, agent_url: e.target.value })}
              placeholder="http://192.168.1.10:8080"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use panel-managed mode (simulated). Set this to enable real process control via a host agent.
            </p>
          </div>

          {/* Advanced */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Advanced Settings
            </span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showAdvanced && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
              <div className="space-y-2">
                <Label>Executable Path</Label>
                <Input
                  value={form.executable_path}
                  onChange={(e) => setForm({ ...form, executable_path: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Data Directory</Label>
                <Input
                  value={form.data_dir}
                  onChange={(e) => setForm({ ...form, data_dir: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Config Directory</Label>
                <Input
                  value={form.config_dir}
                  onChange={(e) => setForm({ ...form, config_dir: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Custom Config (KEY VALUE format)</Label>
                <Textarea
                  value={customConfig}
                  onChange={(e) => setCustomConfig(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || launching}>
            {launching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Create Server
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
