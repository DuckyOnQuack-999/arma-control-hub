import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { getServers, updateServer, testAgentConnection, getBinaryDownloadUrl } from '@/lib/supabaseApi';
import { useAuthStore } from '@/stores/authStore';
import { Copy, Terminal, Server, Download, CircleCheck as CheckCircle, FileDown, Wifi, WifiOff, ExternalLink, Save, Zap, Settings, Globe, BookOpen, FolderOpen, Loader as Loader2 } from 'lucide-react';
import type { Server as ServerType } from '@/data/types';

export default function HostSettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: getServers,
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Host Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Central hub for managing host agents, server paths, and VPS connections.
        </p>
      </div>

      <Tabs defaultValue="hosts">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="hosts">Registered Hosts</TabsTrigger>
          <TabsTrigger value="setup">Host Setup</TabsTrigger>
          <TabsTrigger value="paths">Server Paths</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="hosts"><RegisteredHosts servers={servers} /></TabsContent>
        <TabsContent value="setup"><HostSetup /></TabsContent>
        <TabsContent value="paths">
          <ServerPaths servers={servers} isAdmin={isAdmin} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['servers'] })} />
        </TabsContent>
        <TabsContent value="api"><ApiReference /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 1: Registered Hosts ─────────────────────────────

function RegisteredHosts({ servers }: { servers: ServerType[] }) {
  const navigate = useNavigate();
  const [testing, setTesting] = useState<Record<number, boolean>>({});
  const [results, setResults] = useState<Record<number, { reachable: boolean; message?: string }>>({});

  const grouped = servers.reduce<Record<string, ServerType[]>>((acc, s) => {
    const key = s.agent_url || 'No Agent';
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});

  const testHost = async (serverId: number) => {
    setTesting(p => ({ ...p, [serverId]: true }));
    try {
      const result = await testAgentConnection(serverId);
      setResults(p => ({ ...p, [serverId]: result }));
    } finally {
      setTesting(p => ({ ...p, [serverId]: false }));
    }
  };

  const testAll = async () => {
    const withAgent = servers.filter(s => s.agent_url);
    await Promise.allSettled(withAgent.map(s => testHost(s.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Servers grouped by agent endpoint</p>
        <Button variant="outline" size="sm" onClick={testAll}>
          <Zap className="h-3 w-3 mr-1" /> Test All
        </Button>
      </div>

      {Object.entries(grouped).map(([url, srvs]) => (
        <Card key={url} className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              {url === 'No Agent' ? (
                <><WifiOff className="h-4 w-4 text-muted-foreground" /> No Agent (Panel Managed)</>
              ) : (
                <><Wifi className="h-4 w-4 text-neon-green" /> <span className="font-mono text-xs">{url}</span></>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {srvs.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border p-2">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${
                    results[s.id]?.reachable ? 'bg-green-500' : results[s.id] ? 'bg-red-500' : 'bg-muted-foreground'
                  }`} />
                  <button className="text-sm font-medium hover:text-primary transition-colors" onClick={() => navigate(`/servers/${s.id}`)}>
                    {s.name}
                  </button>
                  <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {results[s.id] && (
                    <span className={`text-[10px] ${results[s.id].reachable ? 'text-neon-green' : 'text-destructive'}`}>
                      {results[s.id].message}
                    </span>
                  )}
                  {s.agent_url && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => testHost(s.id)} disabled={testing[s.id]}>
                      {testing[s.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {servers.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No servers configured yet. Add a server from the Dashboard.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 2: Host Setup ───────────────────────────────────

function HostSetup() {
  const [hostIp, setHostIp] = useState('');
  const [agentPort, setAgentPort] = useState('8080');
  const [binaryPath, setBinaryPath] = useState('/usr/bin/armagetronad-dedicated');
  const [queryPath, setQueryPath] = useState('/usr/bin/armagetronad-serverquery');
  const [dataDir, setDataDir] = useState('/usr/share/armagetronad');
  const [configDir, setConfigDir] = useState('/etc/armagetronad/new');
  const [gamePort, setGamePort] = useState('4534');
  const [generated, setGenerated] = useState('');
  const [showDocker, setShowDocker] = useState(false);
  const [testingDedicated, setTestingDedicated] = useState(false);
  const [testingQuery, setTestingQuery] = useState(false);

  const dedicatedUrl = getBinaryDownloadUrl('armagetronad-dedicated');
  const queryUrl = getBinaryDownloadUrl('armagetronad-serverquery');

  const setLocalhost = () => {
    setHostIp('127.0.0.1');
    setAgentPort('8080');
    toast({ title: 'Localhost preset applied' });
  };

  const testDownload = async (url: string, name: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        toast({ title: `✅ ${name}`, description: 'Binary is accessible' });
      } else {
        toast({ title: `❌ ${name}`, description: `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: `❌ ${name}`, description: 'Could not reach storage', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generateScript = () => {
    if (!hostIp.trim()) {
      toast({ title: 'Host IP required', variant: 'destructive' });
      return;
    }

    const script = `#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Armagetron / RetroCycles — Host Agent Setup Script
# Generated by RxTron Control Panel
# ═══════════════════════════════════════════════════════════
set -euo pipefail

HOST_IP="${hostIp}"
AGENT_PORT="${agentPort}"
BINARY_PATH="${binaryPath}"
QUERY_PATH="${queryPath}"
DATA_DIR="${dataDir}"
CONFIG_DIR="${configDir}"
GAME_PORT="${gamePort}"

echo "╔══════════════════════════════════════════════╗"
echo "║  RxTron Host Agent Installer                 ║"
echo "╚══════════════════════════════════════════════╝"

# 1. Download binaries
echo "[1/5] Downloading binaries..."
curl -fSL "${dedicatedUrl}" -o "\${BINARY_PATH}" || { echo "Failed to download dedicated server"; exit 1; }
curl -fSL "${queryUrl}" -o "\${QUERY_PATH}" || { echo "Failed to download server query"; exit 1; }
chmod +x "\${BINARY_PATH}" "\${QUERY_PATH}"
echo "  ✓ Binaries installed"

# 2. Create directories
echo "[2/5] Setting up directories..."
mkdir -p "\${DATA_DIR}" "\${CONFIG_DIR}"
echo "  ✓ Directories ready"

# 3. Create systemd service for game server
echo "[3/5] Creating game server service..."
cat > /etc/systemd/system/armagetronad.service << UNIT
[Unit]
Description=Armagetron Advanced Dedicated Server
After=network.target

[Service]
Type=simple
ExecStart=\${BINARY_PATH} --datadir \${DATA_DIR} --configdir \${CONFIG_DIR} --port \${GAME_PORT}
Restart=on-failure
RestartSec=5
User=armagetron
WorkingDirectory=\${DATA_DIR}
StandardInput=tty
TTYPath=/dev/tty-arma

[Install]
WantedBy=multi-user.target
UNIT
echo "  ✓ Game server service created"

# 4. Create agent service
echo "[4/5] Creating agent service..."
cat > /etc/systemd/system/rxtron-agent.service << UNIT
[Unit]
Description=RxTron Host Agent
After=network.target armagetronad.service

[Service]
Type=simple
ExecStart=/usr/local/bin/rxtron-agent --port \${AGENT_PORT} --binary \${BINARY_PATH} --datadir \${DATA_DIR} --configdir \${CONFIG_DIR}
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
echo "  ✓ Agent service created"

# 5. Firewall
echo "[5/5] Configuring firewall..."
if command -v ufw &>/dev/null; then
  ufw allow \${GAME_PORT}/udp comment "Armagetron game"
  ufw allow \${AGENT_PORT}/tcp comment "RxTron agent"
  echo "  ✓ UFW rules added"
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=\${GAME_PORT}/udp
  firewall-cmd --permanent --add-port=\${AGENT_PORT}/tcp
  firewall-cmd --reload
  echo "  ✓ firewalld rules added"
else
  echo "  ⚠ No firewall manager found — manually open ports \${GAME_PORT}/udp and \${AGENT_PORT}/tcp"
fi

id -u armagetron &>/dev/null || useradd -r -s /usr/sbin/nologin armagetron

systemctl daemon-reload
systemctl enable armagetronad rxtron-agent

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Setup complete!                             ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Agent URL: http://\${HOST_IP}:\${AGENT_PORT}  ║"
echo "║                                              ║"
echo "║  Paste this URL into the server's Overview   ║"
echo "║  tab in the control panel.                   ║"
echo "║                                              ║"
echo "║  Start services:                             ║"
echo "║    systemctl start armagetronad              ║"
echo "║    systemctl start rxtron-agent              ║"
echo "╚══════════════════════════════════════════════╝"
`;
    setGenerated(script);
    toast({ title: 'Script generated' });
  };

  const dockerCompose = `version: '3.8'
services:
  armagetronad:
    image: armagetronad/server:latest
    ports:
      - "${gamePort}:${gamePort}/udp"
    volumes:
      - ./data:/data
      - ./config:/config
    restart: unless-stopped

  rxtron-agent:
    image: rxtron/agent:latest
    ports:
      - "${agentPort}:${agentPort}"
    environment:
      - BINARY_PATH=${binaryPath}
      - DATA_DIR=/data
      - CONFIG_DIR=/config
    volumes:
      - ./data:/data
      - ./config:/config
    depends_on:
      - armagetronad
    restart: unless-stopped
`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const downloadScript = () => {
    const blob = new Blob([generated], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rxtron-agent-setup-${hostIp.replace(/[^a-zA-Z0-9.-]/g, '_')}.sh`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Binary Availability */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><Download className="h-4 w-4" /> Binary Availability</CardTitle>
          <CardDescription>Test that game server binaries are accessible from storage</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => testDownload(dedicatedUrl, 'dedicated', setTestingDedicated)} disabled={testingDedicated}>
            {testingDedicated ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />} Test dedicated
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => testDownload(queryUrl, 'serverquery', setTestingQuery)} disabled={testingQuery}>
            {testingQuery ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />} Test serverquery
          </Button>
        </CardContent>
      </Card>

      {/* Host Configuration */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Host Configuration</CardTitle>
              <CardDescription>Enter your game server host details</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={setLocalhost}>
              <Globe className="h-3 w-3 mr-1" /> Localhost Preset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Host IP / Hostname *</Label>
            <Input value={hostIp} onChange={e => setHostIp(e.target.value)} placeholder="192.168.1.100 or myserver.local" />
          </div>
          <div className="space-y-2">
            <Label>Agent Port</Label>
            <Input value={agentPort} onChange={e => setAgentPort(e.target.value)} placeholder="8080" />
          </div>
          <div className="space-y-2">
            <Label>Game Server Binary Path</Label>
            <Input value={binaryPath} onChange={e => setBinaryPath(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Server Query Binary Path</Label>
            <Input value={queryPath} onChange={e => setQueryPath(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data Directory</Label>
            <Input value={dataDir} onChange={e => setDataDir(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Config Directory</Label>
            <Input value={configDir} onChange={e => setConfigDir(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Game Port (UDP)</Label>
            <Input value={gamePort} onChange={e => setGamePort(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={generateScript} className="flex-1">
              <Terminal className="h-4 w-4 mr-2" /> Generate Script
            </Button>
            <Button variant="outline" onClick={() => setShowDocker(!showDocker)}>
              Docker
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Docker Compose */}
      {showDocker && (
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Docker Compose</CardTitle>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(dockerCompose)}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">{dockerCompose}</pre>
          </CardContent>
        </Card>
      )}

      {/* Generated Script */}
      {generated && (
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><FileDown className="h-5 w-5" /> Install Script</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadScript}><Download className="h-4 w-4 mr-1" /> Download .sh</Button>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(generated)}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
              </div>
            </div>
            <CardDescription>Run this script as root on your game server host</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap">{generated}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: Server Paths ─────────────────────────────────

function ServerPaths({ servers, isAdmin, onUpdate }: { servers: ServerType[]; isAdmin: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState<Record<number, Partial<ServerType>>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const startEdit = (s: ServerType) => {
    setEditing(p => ({
      ...p,
      [s.id]: {
        executable_path: s.executable_path,
        data_dir: s.data_dir,
        config_dir: s.config_dir,
        port: s.port,
        max_players: s.max_players,
      },
    }));
  };

  const handleSave = async (id: number) => {
    const updates = editing[id];
    if (!updates) return;
    setSaving(p => ({ ...p, [id]: true }));
    try {
      await updateServer(id, updates);
      toast({ title: 'Server paths updated' });
      setEditing(p => { const n = { ...p }; delete n[id]; return n; });
      onUpdate();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(p => ({ ...p, [id]: false }));
    }
  };

  const cancelEdit = (id: number) => {
    setEditing(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const updateField = (id: number, field: string, value: string | number) => {
    setEditing(p => ({
      ...p,
      [id]: { ...p[id], [field]: value },
    }));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Edit server paths, ports, and player limits. Changes take effect on next server restart.</p>

      {servers.map(s => {
        const isEditing = !!editing[s.id];
        const vals = editing[s.id] || s;

        return (
          <Card key={s.id} className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-sm flex items-center gap-2">
                  <Server className="h-4 w-4" /> {s.name}
                  <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                </CardTitle>
                {isAdmin && !isEditing && (
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => startEdit(s)}>
                    <Settings className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
                {isEditing && (
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs" onClick={() => handleSave(s.id)} disabled={saving[s.id]}>
                      {saving[s.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Save
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => cancelEdit(s.id)}>Cancel</Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Executable</Label>
                {isEditing ? (
                  <Input value={vals.executable_path} onChange={e => updateField(s.id, 'executable_path', e.target.value)} className="h-8 text-xs font-mono" />
                ) : (
                  <p className="font-mono text-xs truncate">{s.executable_path}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Data Dir</Label>
                {isEditing ? (
                  <Input value={vals.data_dir} onChange={e => updateField(s.id, 'data_dir', e.target.value)} className="h-8 text-xs font-mono" />
                ) : (
                  <p className="font-mono text-xs truncate">{s.data_dir}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Config Dir</Label>
                {isEditing ? (
                  <Input value={vals.config_dir} onChange={e => updateField(s.id, 'config_dir', e.target.value)} className="h-8 text-xs font-mono" />
                ) : (
                  <p className="font-mono text-xs truncate">{s.config_dir}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  {isEditing ? (
                    <Input type="number" value={vals.port} onChange={e => updateField(s.id, 'port', Number(e.target.value))} className="h-8 text-xs font-mono" />
                  ) : (
                    <p className="font-mono text-xs">{s.port}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Max Players</Label>
                  {isEditing ? (
                    <Input type="number" value={vals.max_players} onChange={e => updateField(s.id, 'max_players', Number(e.target.value))} className="h-8 text-xs font-mono" />
                  ) : (
                    <p className="font-mono text-xs">{s.max_players}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {servers.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No servers configured.</CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 4: API Reference ────────────────────────────────

function ApiReference() {
  const endpoints = [
    { method: 'POST', path: '/control', desc: 'Start, stop, restart, kill, or send a command to a server', body: '{ action: start|stop|restart|kill|command, serverId, command? }' },
    { method: 'POST', path: '/status', desc: 'Poll agent or compute server status (CPU, memory, players)', body: '{ serverId }' },
    { method: 'POST', path: '/console', desc: 'Fetch recent console output lines from DB or agent', body: '{ serverId, since?, limit? }' },
    { method: 'POST', path: '/files', desc: 'File operations: list, read, write, rename, delete, mkdir', body: '{ serverId, operation, path, content? }' },
  ];

  const agentEndpoints = [
    { method: 'GET', path: '/status', desc: 'Returns server process status, CPU, memory, player count' },
    { method: 'POST', path: '/control', desc: 'Accepts { action: start|stop|restart|kill }' },
    { method: 'POST', path: '/command', desc: 'Send a console command to the running process stdin' },
    { method: 'GET', path: '/console?since=N', desc: 'Returns console output lines since timestamp N' },
    { method: 'GET', path: '/files?path=/dir', desc: 'List directory contents' },
    { method: 'GET', path: '/files/read?path=/file', desc: 'Read file content' },
    { method: 'POST', path: '/files/write', desc: 'Write file: { path, content }' },
    { method: 'POST', path: '/files/rename', desc: 'Rename file: { oldPath, newPath }' },
    { method: 'POST', path: '/files/delete', desc: 'Delete file: { path }' },
    { method: 'POST', path: '/files/mkdir', desc: 'Create directory: { path }' },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Panel Edge Functions</CardTitle>
          <CardDescription>These edge functions proxy requests from the panel to your host agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {endpoints.map(ep => (
              <div key={ep.path} className="flex items-start gap-3 rounded-md border border-border p-2.5">
                <Badge variant="outline" className="text-[10px] shrink-0 font-mono">{ep.method}</Badge>
                <div>
                  <span className="font-mono text-xs text-primary">{ep.path}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{ep.desc}</p>
                  {ep.body && <code className="text-[10px] text-muted-foreground">{ep.body}</code>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4" /> Agent HTTP Endpoints</CardTitle>
          <CardDescription>Your host agent must implement these endpoints for full panel functionality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {agentEndpoints.map(ep => (
              <div key={ep.path + ep.method} className="flex items-start gap-3 rounded-md border border-border p-2.5">
                <Badge variant="outline" className={`text-[10px] shrink-0 font-mono ${ep.method === 'GET' ? 'border-neon-green/30 text-neon-green' : 'border-primary/30 text-primary'}`}>
                  {ep.method}
                </Badge>
                <div>
                  <span className="font-mono text-xs">{ep.path}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{ep.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
