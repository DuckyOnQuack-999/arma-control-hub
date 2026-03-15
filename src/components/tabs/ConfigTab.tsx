import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConfig, saveConfig, getRawConfig, saveRawConfig } from '@/lib/supabaseApi';
import { configKeys } from '@/data/configKeys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Save, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import type { ServerStatus, ConfigSection } from '@/data/types';

const sectionLabels: Record<ConfigSection, string> = {
  gameplay: 'Gameplay',
  network: 'Network',
  physics: 'Physics',
  scoring: 'Scoring',
  admin: 'Admin',
  misc: 'Miscellaneous',
};

const sections = Object.keys(sectionLabels) as ConfigSection[];
const RAW_FILES = ['settings_custom.cfg', 'server_info.cfg', 'everytime.cfg'] as const;

export default function ConfigTab({ serverId, serverStatus }: { serverId: number; serverStatus: ServerStatus }) {
  const [localConfig, setLocalConfig] = useState<Record<string, string>>({});
  const [rawContent, setRawContent] = useState('');
  const [rawFile, setRawFile] = useState<string>('settings_custom.cfg');
  const [hasChanges, setHasChanges] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['config', serverId],
    queryFn: async () => {
      const c = await getConfig(serverId);
      setLocalConfig(c);
      return c;
    },
  });

  const { data: rawData } = useQuery({
    queryKey: ['raw-config', serverId, rawFile],
    queryFn: () => getRawConfig(serverId, rawFile),
  });

  useEffect(() => {
    if (rawData !== undefined) {
      setRawContent(rawData);
    }
  }, [rawData]);

  if (isLoading) return <LoadingSpinner />;

  const handleChange = (key: string, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveConfig(serverId, localConfig);
    setHasChanges(false);
    toast({ title: 'Config saved', description: serverStatus === 'online' ? 'Changes will take effect next round' : 'Configuration updated' });
  };

  const handleSaveRaw = async () => {
    await saveRawConfig(serverId, rawFile, rawContent);
    setHasChanges(false);
    toast({ title: 'Raw config saved' });
  };

  const handleResetSection = (section: ConfigSection) => {
    const sectionKeys = configKeys.filter(k => k.section === section);
    const updated = { ...localConfig };
    sectionKeys.forEach(k => { updated[k.key] = k.defaultValue; });
    setLocalConfig(updated);
    setHasChanges(true);
    toast({ title: `${sectionLabels[section]} reset to defaults` });
  };

  return (
    <div className="space-y-4">
      {hasChanges && (
        <div className="flex items-center gap-2 rounded-md border border-neon-yellow/50 bg-neon-yellow/10 px-3 py-2 text-xs text-neon-yellow">
          <AlertTriangle className="h-3.5 w-3.5" /> Unsaved changes
        </div>
      )}

      <Tabs defaultValue="visual">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="visual">Visual Editor</TabsTrigger>
          <TabsTrigger value="raw">Raw Editor</TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-3">
          <Accordion type="multiple" defaultValue={sections}>
            {sections.map(section => {
              const sectionKeys = configKeys.filter(k => k.section === section);
              return (
                <AccordionItem key={section} value={section} className="border-border">
                  <AccordionTrigger className="font-display text-sm tracking-wide hover:no-underline">
                    {sectionLabels[section]}
                    <span className="ml-2 text-xs text-muted-foreground font-body">({sectionKeys.length} keys)</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {sectionKeys.map(meta => {
                        const val = localConfig[meta.key] ?? meta.defaultValue;
                        return (
                          <div key={meta.key} className="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Label className="font-mono text-xs">{meta.key}</Label>
                                <Tooltip>
                                  <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                                  <TooltipContent><p className="max-w-xs text-xs">{meta.description}</p></TooltipContent>
                                </Tooltip>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">Default: {meta.defaultValue || '(empty)'}</p>
                            </div>
                            <div className="w-40 shrink-0">
                              {meta.type === 'bool' ? (
                                <Switch
                                  checked={val === '1' || val === 'true'}
                                  onCheckedChange={v => handleChange(meta.key, v ? '1' : '0')}
                                />
                              ) : meta.type === 'int' || meta.type === 'float' ? (
                                <Input
                                  type="number"
                                  value={val}
                                  onChange={e => handleChange(meta.key, e.target.value)}
                                  min={meta.min}
                                  max={meta.max}
                                  step={meta.type === 'float' ? 0.1 : 1}
                                  className="h-8 font-mono text-xs"
                                />
                              ) : (
                                <Input
                                  value={val}
                                  onChange={e => handleChange(meta.key, e.target.value)}
                                  className="h-8 font-mono text-xs"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <Button size="sm" variant="ghost" onClick={() => handleResetSection(section)} className="text-xs">
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset to Defaults
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" /> Save Changes
          </Button>
        </TabsContent>

        <TabsContent value="raw" className="space-y-3">
          <div className="flex gap-2">
            {RAW_FILES.map(f => (
              <Button key={f} size="sm" variant={rawFile === f ? 'default' : 'outline'} onClick={() => { setRawFile(f); setHasChanges(false); }}
                className="font-mono text-xs">
                {f}
              </Button>
            ))}
          </div>
          <Textarea
            value={rawContent}
            onChange={e => { setRawContent(e.target.value); setHasChanges(true); }}
            className="min-h-[400px] font-mono text-xs border-border bg-muted"
            placeholder="KEY VALUE"
          />
          <Button onClick={handleSaveRaw} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" /> Save Raw Config
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
