import * as fs from 'fs';
import * as path from 'path';
import { ParsedConfig } from './types';

export function parseConfigFile(filePath: string): ParsedConfig {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const config: ParsedConfig = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('REM')) {
      continue;
    }

    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      config[trimmed] = '';
      continue;
    }

    const key = trimmed.substring(0, spaceIdx).trim();
    let value = trimmed.substring(spaceIdx + 1).trim();

    // Remove inline comments
    const commentIdx = value.indexOf('#');
    if (commentIdx !== -1) {
      value = value.substring(0, commentIdx).trim();
    }

    // Parse booleans
    if (value.toLowerCase() === 'true' || value.toLowerCase() === '1') {
      config[key] = true;
    } else if (value.toLowerCase() === 'false' || value.toLowerCase() === '0') {
      config[key] = false;
    } else if (/^-?\d+$/.test(value)) {
      config[key] = parseInt(value, 10);
    } else if (/^-?\d+\.\d+$/.test(value)) {
      config[key] = parseFloat(value);
    } else {
      config[key] = value;
    }
  }

  return config;
}

export function serializeConfig(config: ParsedConfig): string {
  const lines: string[] = [];
  const keys = Object.keys(config).sort();

  for (const key of keys) {
    const value = config[key];
    if (value === true) {
      lines.push(`${key} 1`);
    } else if (value === false) {
      lines.push(`${key} 0`);
    } else {
      lines.push(`${key} ${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function writeConfigAtomic(filePath: string, config: ParsedConfig): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = filePath + '.tmp';
  const content = serializeConfig(config);
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function getConfigFilePath(dataDir: string, configName: string): string {
  const safeName = path.basename(configName);
  return path.join(dataDir, 'config', safeName);
}

export function listConfigFiles(dataDir: string): string[] {
  const configDir = path.join(dataDir, 'config');
  if (!fs.existsSync(configDir)) {
    return [];
  }
  return fs.readdirSync(configDir).filter(f => f.endsWith('.cfg'));
}
