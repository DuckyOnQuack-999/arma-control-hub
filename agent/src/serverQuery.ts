import * as dgram from 'dgram';
import { ServerBrowserEntry } from './types';

const MASTER_SERVERS = [
  { host: 'master1.armagetronad.net', port: 4533 },
  { host: 'master2.armagetronad.net', port: 4533 },
  { host: 'master3.armagetronad.net', port: 4533 },
];

const QUERY_TIMEOUT = 3000;

export function queryServer(ip: string, port: number): Promise<Partial<ServerBrowserEntry>> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      resolve({});
    }, QUERY_TIMEOUT);

    // Armagetron status query packet
    const query = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();

      try {
        const response = parseServerResponse(msg);
        resolve({
          name: response.name || 'Unknown',
          ip,
          port,
          players: response.players || 0,
          maxPlayers: response.maxPlayers || 0,
          map: response.map || 'Unknown',
          version: response.version || 'Unknown',
        });
      } catch (e) {
        resolve({});
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve({});
    });

    socket.send(query, port, ip, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        resolve({});
      }
    });
  });
}

function parseServerResponse(buf: Buffer): Partial<ServerBrowserEntry> {
  // Armagetron response format is complex; this is a simplified parser
  const str = buf.toString('utf-8', 4); // Skip 4-byte header
  const lines = str.split('\n');
  const result: Partial<ServerBrowserEntry> = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(' ');
    const value = valueParts.join(' ');

    switch (key) {
      case 'SERVER_NAME':
        result.name = value;
        break;
      case 'MAP_NAME':
        result.map = value;
        break;
      case 'NUM_PLAYERS':
        result.players = parseInt(value, 10);
        break;
      case 'MAX_PLAYERS':
        result.maxPlayers = parseInt(value, 10);
        break;
      case 'VERSION':
        result.version = value;
        break;
    }
  }

  return result;
}

export async function queryMasterServers(): Promise<ServerBrowserEntry[]> {
  const allServers: ServerBrowserEntry[] = [];

  for (const master of MASTER_SERVERS) {
    try {
      const servers = await queryMasterServer(master.host, master.port);
      allServers.push(...servers);
    } catch (e) {
      // Try next master
    }
  }

  return allServers;
}

function queryMasterServer(host: string, port: number): Promise<ServerBrowserEntry[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      resolve([]);
    }, QUERY_TIMEOUT);

    // Master server list request
    const query = Buffer.from([0x00, 0x00, 0x00, 0x01]);

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();

      try {
        const servers = parseMasterResponse(msg);
        resolve(servers);
      } catch (e) {
        resolve([]);
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve([]);
    });

    socket.send(query, port, host, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        resolve([]);
      }
    });
  });
}

function parseMasterResponse(buf: Buffer): ServerBrowserEntry[] {
  const servers: ServerBrowserEntry[] = [];
  let offset = 4;

  while (offset + 6 <= buf.length) {
    const ip = `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
    const port = buf.readUInt16BE(offset + 4);
    offset += 6;

    servers.push({
      name: 'Unknown',
      ip,
      port,
      players: 0,
      maxPlayers: 0,
      map: 'Unknown',
      version: 'Unknown',
    });
  }

  return servers;
}

export async function fallbackScrape(): Promise<ServerBrowserEntry[]> {
  // Fallback: scrape from stats site if UDP fails
  try {
    const response = await fetch('https://stats.retrocycles.net/server-list');
    if (!response.ok) {
      return [];
    }
    const html = await response.text();
    return parseStatsHtml(html);
  } catch (e) {
    return [];
  }
}

function parseStatsHtml(html: string): ServerBrowserEntry[] {
  // Very basic HTML parsing - in production use a proper parser
  const servers: ServerBrowserEntry[] = [];
  const regex = /<tr[^>]*>.*?<td>(.*?)<\/td>.*?<td>(.*?)<\/td>.*?<td>(\d+)<\/td>.*?<td>(\d+)<\/td>.*?<\/tr>/gs;
  let match;

  while ((match = regex.exec(html)) !== null) {
    servers.push({
      name: match[1].trim(),
      ip: match[2].split(':')[0],
      port: parseInt(match[2].split(':')[1], 10) || 4534,
      players: parseInt(match[3], 10),
      maxPlayers: parseInt(match[4], 10),
      map: 'Unknown',
      version: 'Unknown',
    });
  }

  return servers;
}
