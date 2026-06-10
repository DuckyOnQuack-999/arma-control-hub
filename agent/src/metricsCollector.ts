import pidusage from 'pidusage';
import { getAllProcesses } from './processManager';
import { insertMetric, pruneMetrics } from './db';
import { MetricPoint } from './types';

const METRICS_INTERVAL = 5000; // 5 seconds
let intervalId: NodeJS.Timeout | null = null;
const metricsSubscribers = new Map<string, Set<(metric: MetricPoint) => void>>();

export function subscribeToMetrics(serverId: string, callback: (metric: MetricPoint) => void): () => void {
  if (!metricsSubscribers.has(serverId)) {
    metricsSubscribers.set(serverId, new Set());
  }
  metricsSubscribers.get(serverId)!.add(callback);
  return () => {
    metricsSubscribers.get(serverId)?.delete(callback);
  };
}

function broadcastMetric(serverId: string, metric: MetricPoint) {
  const subs = metricsSubscribers.get(serverId);
  if (subs) {
    for (const cb of subs) {
      try { cb(metric); } catch (e) { /* ignore */ }
    }
  }
}

export function startMetricsCollector(): void {
  if (intervalId) {
    return;
  }

  intervalId = setInterval(async () => {
    const processes = getAllProcesses();

    for (const [serverId, proc] of processes) {
      if (!proc.pid || proc.status !== 'online') {
        continue;
      }

      try {
        const stats = await pidusage(proc.pid);
        const metric: MetricPoint = {
          serverId,
          timestamp: Date.now(),
          cpu: Math.round(stats.cpu * 100) / 100,
          memory: Math.round(stats.memory / 1024 / 1024 * 100) / 100,
          playerCount: proc.players.size,
        };

        proc.metrics.push(metric);
        if (proc.metrics.length > 1000) {
          proc.metrics.shift();
        }
        proc.lastMetricTime = Date.now();

        insertMetric(serverId, metric.timestamp, metric.cpu, metric.memory, metric.playerCount);
        broadcastMetric(serverId, metric);
      } catch (e) {
        // Process may have exited
      }
    }

    // Prune old metrics daily
    const now = Date.now();
    for (const [serverId, proc] of processes) {
      if (now - proc.lastMetricTime > 86400000) {
        pruneMetrics(serverId, 7);
      }
    }
  }, METRICS_INTERVAL);
}

export function stopMetricsCollector(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function getMetricsHistory(serverId: string, hours: number = 24): MetricPoint[] {
  const proc = getAllProcesses().get(serverId);
  if (!proc) {
    return [];
  }
  const cutoff = Date.now() - hours * 3600 * 1000;
  return proc.metrics.filter(m => m.timestamp > cutoff);
}
