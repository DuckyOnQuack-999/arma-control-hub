import { create } from 'zustand';
import type { ConsoleLine } from '@/data/types';

interface ConsoleStore {
  lines: ConsoleLine[];
  commandHistory: string[];
  historyIndex: number;
  addLine: (line: ConsoleLine) => void;
  addLines: (lines: ConsoleLine[]) => void;
  clearLines: () => void;
  addCommand: (cmd: string) => void;
  setHistoryIndex: (idx: number) => void;
}

export const useConsoleStore = create<ConsoleStore>()((set) => ({
  lines: [],
  commandHistory: [],
  historyIndex: -1,

  addLine: (line) =>
    set((state) => ({
      lines: [...state.lines, line].slice(-1000),
    })),

  addLines: (lines) =>
    set((state) => ({
      lines: [...state.lines, ...lines].slice(-1000),
    })),

  clearLines: () => set({ lines: [] }),

  addCommand: (cmd) =>
    set((state) => ({
      commandHistory: [...state.commandHistory, cmd].slice(-50),
      historyIndex: -1,
    })),

  setHistoryIndex: (idx) => set({ historyIndex: idx }),
}));
