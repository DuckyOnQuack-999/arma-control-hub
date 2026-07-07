import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString();
}

export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function getStateColor(state: string): string {
  switch (state) {
    case 'running':
      return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'starting':
      return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    case 'stopping':
      return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    case 'crashed':
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    case 'idle':
      return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    default:
      return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

export function getStateIcon(state: string): string {
  switch (state) {
    case 'running':
      return '●';
    case 'starting':
      return '◐';
    case 'stopping':
      return '◑';
    case 'crashed':
      return '✕';
    case 'idle':
      return '○';
    default:
      return '○';
  }
}