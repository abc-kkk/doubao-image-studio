import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, ModelId, AspectRatio } from '../types';

interface SettingsStore {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const defaults: AppSettings = {
  websocketUrl: 'ws://localhost:8081/ws',
  saveDir: '',
  historyDir: '',
  defaultModel: 'doubao' as ModelId,
  defaultAspectRatio: '1:1' as AspectRatio,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaults,
      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),
      resetSettings: () => set({ settings: defaults }),
    }),
    {
      name: 'ai-studio-settings',
      version: 3,
      migrate: (_old: unknown) => ({ settings: defaults }),
    }
  )
);
