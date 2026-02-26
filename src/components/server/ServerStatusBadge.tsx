import type { ServerStatus } from '@/data/types';
import { cn } from '@/lib/utils';

const statusConfig: Record<ServerStatus, { label: string; className: string }> = {
  online: { label: 'Online', className: 'bg-neon-green/20 text-neon-green border-neon-green/50' },
  offline: { label: 'Offline', className: 'bg-neon-red/20 text-neon-red border-neon-red/50' },
  starting: { label: 'Starting', className: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/50 animate-pulse-glow' },
  stopping: { label: 'Stopping', className: 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/50 animate-pulse-glow' },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-body', cfg.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', status === 'online' ? 'bg-neon-green' : status === 'offline' ? 'bg-neon-red' : 'bg-neon-yellow')} />
      {cfg.label}
    </span>
  );
}
