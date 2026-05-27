import { Play, Square, RotateCcw, Skull } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { ServerStatus } from '@/data/types';
import { useState } from 'react';

interface Props {
  status: ServerStatus;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onKill: () => void;
  loading?: boolean;
}

export function ServerControlBar({ status, onStart, onStop, onRestart, onKill, loading }: Props) {
  const [confirmAction, setConfirmAction] = useState<null | 'stop' | 'restart' | 'kill'>(null);

  const isRunning = status === 'online';
  const canStart = status === 'offline' || status === 'crashed';
  const isBusy = status === 'starting' || status === 'stopping';
  const canRestart = isRunning || canStart;
  const canKill = status !== 'offline';

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={!canStart || loading} onClick={onStart}
        className="bg-success/10 text-success border border-success/30 hover:bg-success/20">
        <Play className="h-3.5 w-3.5" /> Start
      </Button>
      <Button size="sm" disabled={!isRunning || loading} onClick={() => setConfirmAction('stop')}
        className="bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">
        <Square className="h-3.5 w-3.5" /> Stop
      </Button>
      <Button size="sm" disabled={!canRestart || loading} onClick={() => setConfirmAction('restart')}
        className="bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20">
        <RotateCcw className="h-3.5 w-3.5" /> Restart
      </Button>
      <Button size="sm" variant="destructive" disabled={!canKill || loading} onClick={() => setConfirmAction('kill')}>
        <Skull className="h-3.5 w-3.5" /> Kill
      </Button>

      <ConfirmDialog
        open={confirmAction === 'stop'}
        title="Stop Server"
        description="This will gracefully stop the server. All connected players will be disconnected."
        onConfirm={() => { setConfirmAction(null); onStop(); }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'restart'}
        title="Restart Server"
        description="This will restart the server. Players will be briefly disconnected."
        onConfirm={() => { setConfirmAction(null); onRestart(); }}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'kill'}
        title="Force Kill Server"
        description="This will immediately kill the server process. Use only if the server is unresponsive."
        destructive
        onConfirm={() => { setConfirmAction(null); onKill(); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
