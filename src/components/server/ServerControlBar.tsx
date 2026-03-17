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

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={!canStart || loading} onClick={onStart}
        className="bg-neon-green/20 text-neon-green border border-neon-green/50 hover:bg-neon-green/30">
        <Play className="h-3.5 w-3.5" /> Start
      </Button>
      <Button size="sm" disabled={!isRunning || loading} onClick={() => setConfirmAction('stop')}
        className="bg-neon-red/20 text-neon-red border border-neon-red/50 hover:bg-neon-red/30">
        <Square className="h-3.5 w-3.5" /> Stop
      </Button>
      <Button size="sm" disabled={!isRunning || loading} onClick={() => setConfirmAction('restart')}
        className="bg-neon-yellow/20 text-neon-yellow border border-neon-yellow/50 hover:bg-neon-yellow/30">
        <RotateCcw className="h-3.5 w-3.5" /> Restart
      </Button>
      <Button size="sm" variant="destructive" disabled={(status === 'offline') || loading} onClick={() => setConfirmAction('kill')}>
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
