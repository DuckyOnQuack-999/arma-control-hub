import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createServer, serverAction, saveConfig } from '@/lib/supabaseApi';
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
  const [template, setTemplate] = useState<keyof typeof CONFIG_TEMPLATES>('default');
  const [customConfig, setCustomConfig] = useState(CONFIG_TEMPLATES.default.config);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);

  const handleTemplateChange = (value: string) => {
    const key = value as keyof typeof CONFIG_TEMPLATES;
    setTemplate(key);
    // Update server name and max players from template
    const configNameMatch = CONFIG_TEMPLATES[key].config.match(/SERVER_NAME\s+(.+)/);
    if (configNameMatch && !form.name) {
      setForm(f => ({ ...f, name: configNameMatch[1].trim() }));
    }
    setCustomConfig(CONFIG_TEMPLATES[key].config);
  };

  const parseConfigToKeyValue = (configText: string): Record<string, string> => {
    const result: Record<string, string> = {};
    const lines = configText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const key = parts[0];
          const value = parts.slice(1).join(' ');
          result[key] = value;
        }
      }
    }
    return result;
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || form.name.length < 3) {
      toast({ title: 'Validation Error', description: 'Name must be at least 3 characters', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const server = await createServer(form);

      // Create default config files in database
      const configData = parseConfigToKeyValue(customConfig);
      configData['PORT'] = String(form.port);
      configData['MAX_PLAYERS'] = String(form.max_players);
      if (!configData['SERVER_NAME']) {
        configData['SERVER_NAME'] = form.name;
      }

      try {
        await saveConfig(server.id, configData);
      } catch (cfgErr) {
        console.warn('Failed to save initial config:', cfgErr);
      }

      toast({ title: 'Server created', description: `${form.name} has been added with ${template} configuration` });

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
    } catch (err: any) {
      toast({ title: 'Failed to create server', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isWorking = loading || launching;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isWorking && onClose()}>
      <DialogContent className="border-border bg-card sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add Server</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {/* Basic Settings */}
          <div className="grid gap-1.5">
            <Label>Server Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Server" />
          </div>

          {/* Config Template Selection */}
          <div className="grid gap-1.5">
            <Label>Configuration Template</Label>
            <Select value={template} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONFIG_TEMPLATES).map(([key, tpl]) => (
                  <SelectItem key={key} value={key}>
                    {tpl.name} - {tpl.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Config Editor */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Configuration File (settings_custom.cfg)
              </Label>
              <span className="text-xs text-muted-foreground">Edit above or modify directly</span>
            </div>
            <Textarea
              value={customConfig}
              onChange={e => setCustomConfig(e.target.value)}
              className="font-mono text-xs min-h-[150px] bg-muted"
              placeholder="KEY VALUE"
            />
          </div>

          {/* Quick Settings */}
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

          {/* Advanced Settings Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center justify-between w-full"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>Advanced Settings</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-border pt-3">
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
            </div>
          )}

          {/* Agent URL */}
          <div className="grid gap-1.5">
            <Label>Host Agent URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                value={form.agent_url}
                onChange={e => setForm(f => ({ ...f, agent_url: e.target.value }))}
                placeholder="http://192.168.1.10:8080"
                className="font-mono text-xs flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs shrink-0"
                onClick={() => setForm(f => ({ ...f, agent_url: 'http://127.0.0.1:8080' }))}
              >
                Localhost
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {form.agent_url
                ? 'Server will be auto-started on the agent after creation.'
                : 'Leave empty for panel-managed mode (database-stored configs, no process control).'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isWorking}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isWorking}>
            {launching ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Starting…</>
            ) : loading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</>
            ) : form.agent_url ? (
              <><Play className="h-4 w-4 mr-1" /> Create & Start</>
            ) : (
              'Create Server'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
