import { CommandHandler, CommandContext, CommandResult } from '../index.js';

export const sayCommand: CommandHandler = async (command, context) => {
  const message = command.args.join(' ');
  if (!message) {
    return { success: false, error: 'Message required for say command' };
  }
  return context.processManager.sendCommand(command.serverId, `SAY ${message}`);
};

export const kickCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  if (!playerName) {
    return { success: false, error: 'Player name required for kick command' };
  }
  return context.processManager.sendCommand(command.serverId, `KICK ${playerName}`);
};

export const banCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  const reason = command.args.slice(1).join(' ') || 'No reason provided';
  if (!playerName) {
    return { success: false, error: 'Player name required for ban command' };
  }
  return context.processManager.sendCommand(command.serverId, `BAN ${playerName} "${reason}"`);
};

export const unbanCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  if (!playerName) {
    return { success: false, error: 'Player name required for unban command' };
  }
  return context.processManager.sendCommand(command.serverId, `UNBAN ${playerName}`);
};

export const mapCommand: CommandHandler = async (command, context) => {
  const mapName = command.args[0];
  if (!mapName) {
    return { success: false, error: 'Map name required for map command' };
  }
  return context.processManager.sendCommand(command.serverId, `MAP ${mapName}`);
};

export const restartCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'RESTART');
};

export const shutdownCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'SHUTDOWN');
};

export const pauseCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'PAUSE');
};

export const resumeCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'RESUME');
};

export const statusCommand: CommandHandler = async (command, context) => {
  const info = await context.processManager.getProcessInfo(command.serverId);
  if (!info) {
    return { success: false, error: 'Server process not found' };
  }
  return {
    success: true,
    data: info,
    output: `Server ${command.serverId}: ${info.status} (PID: ${info.pid}, CPU: ${info.cpuUsage}%, MEM: ${info.memoryUsage}MB, Uptime: ${info.uptime}s)`,
  };
};

export const logsCommand: CommandHandler = async (command, context) => {
  const lines = parseInt(command.args[0] || '50', 10);
  const logs = await context.processManager.getLogs(command.serverId, lines);
  return {
    success: true,
    data: logs,
    output: logs.join('\n'),
  };
};

export const playersCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'PLAYERS');
};

export const configCommand: CommandHandler = async (command, context) => {
  const key = command.args[0];
  const value = command.args[1];
  if (!key) {
    return { success: false, error: 'Config key required' };
  }
  if (value === undefined) {
    return context.processManager.sendCommand(command.serverId, `CONFIG ${key}`);
  }
  return context.processManager.sendCommand(command.serverId, `CONFIG ${key} ${value}`);
};

export const helpCommand: CommandHandler = async (command, context) => {
  const { listCommands } = await import('../index.js');
  const commands = listCommands();
  return {
    success: true,
    output: `Available commands:\n${commands.map(c => `  /${c}`).join('\n')}`,
    data: commands,
  };
};