import { CommandHandler, CommandResult, registerCommand } from '../index';

const sayCommand: CommandHandler = async (command, context) => {
  const message = command.args.join(' ');
  if (!message) {
    return { success: false, error: 'Message required for say command' };
  }
  return context.processManager.sendCommand(command.serverId, `SAY ${message}`);
};

const kickCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  if (!playerName) {
    return { success: false, error: 'Player name required for kick command' };
  }
  return context.processManager.sendCommand(command.serverId, `KICK ${playerName}`);
};

const banCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  const reason = command.args.slice(1).join(' ') || 'No reason provided';
  if (!playerName) {
    return { success: false, error: 'Player name required for ban command' };
  }
  return context.processManager.sendCommand(command.serverId, `BAN ${playerName} "${reason}"`);
};

const unbanCommand: CommandHandler = async (command, context) => {
  const playerName = command.args[0];
  if (!playerName) {
    return { success: false, error: 'Player name required for unban command' };
  }
  return context.processManager.sendCommand(command.serverId, `UNBAN ${playerName}`);
};

const mapCommand: CommandHandler = async (command, context) => {
  const mapName = command.args[0];
  if (!mapName) {
    return { success: false, error: 'Map name required for map command' };
  }
  return context.processManager.sendCommand(command.serverId, `MAP ${mapName}`);
};

const restartCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'RESTART');
};

const shutdownCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'SHUTDOWN');
};

const pauseCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'PAUSE');
};

const resumeCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'RESUME');
};

const statusCommand: CommandHandler = async (command, context) => {
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

const logsCommand: CommandHandler = async (command, context) => {
  const lines = parseInt(command.args[0] || '50', 10);
  const logs = await context.processManager.getLogs(command.serverId, lines);
  return {
    success: true,
    data: logs,
    output: logs.join('\n'),
  };
};

const playersCommand: CommandHandler = async (command, context) => {
  return context.processManager.sendCommand(command.serverId, 'PLAYERS');
};

const configCommand: CommandHandler = async (command, context) => {
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

const helpCommand: CommandHandler = async (command, context) => {
  const { listCommands } = await import('../index');
  const commands = listCommands();
  return {
    success: true,
    output: `Available commands:\n${commands.map(c => `  /${c}`).join('\n')}`,
    data: commands,
  };
};

// Register all commands
registerCommand('say', sayCommand);
registerCommand('kick', kickCommand);
registerCommand('ban', banCommand);
registerCommand('unban', unbanCommand);
registerCommand('map', mapCommand);
registerCommand('restart', restartCommand);
registerCommand('shutdown', shutdownCommand);
registerCommand('pause', pauseCommand);
registerCommand('resume', resumeCommand);
registerCommand('status', statusCommand);
registerCommand('logs', logsCommand);
registerCommand('players', playersCommand);
registerCommand('config', configCommand);
registerCommand('help', helpCommand);

export {
  sayCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  mapCommand,
  restartCommand,
  shutdownCommand,
  pauseCommand,
  resumeCommand,
  statusCommand,
  logsCommand,
  playersCommand,
  configCommand,
  helpCommand,
};
