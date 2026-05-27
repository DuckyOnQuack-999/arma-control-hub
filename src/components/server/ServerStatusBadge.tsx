import type { ServerStatus } from '@/data/types';
import { cn } from '@/lib/utils';

const statusConfig: Record<ServerStatus, { label: string; className: string; dotClass: string }> = {
  online: { label: 'Online', className: 'bg-success/10 text-success border-success/30', dotClass: 'bg-success' },
  offline: { label: 'Offline', className: 'bg-destructive/10 text-destructive border-destructive/30', dotClass: 'bg-destructive' },
  starting: { label: 'Starting', className: 'bg-warning/10 text-warning border-warning/30 animate-pulse-glow', dotClass: 'bg-warning' },
  stopping: { label: 'Stopping', className: 'bg-warning/10 text-warning border-warning/30 animate-pulse-glow', dotClass: 'bg-warning' },
  crashed: { label: 'Crashed', className: 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse-glow', dotClass: 'bg-destructive' },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-body', cfg.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}
