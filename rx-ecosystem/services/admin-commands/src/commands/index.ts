import { registerCommand } from '../index.js';
import {
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
} from './standard.js';

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