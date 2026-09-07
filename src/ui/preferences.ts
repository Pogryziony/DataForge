import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCallback } from 'react';

interface Preferences {
  language: 'en' | 'pl';
  theme: 'light' | 'dark';
  setLanguage(language: Preferences['language']): void;
  setTheme(theme: Preferences['theme']): void;
}
export const usePreferences = create<Preferences>()(persist(set => ({
  language: 'en', theme: 'light',
  setLanguage: language => set({ language }),
  setTheme: theme => set({ theme }),
}), { name: 'dataforge-preferences', version: 1 }));
export function useText() {
  const language = usePreferences(state => state.language);
  return useCallback((english: string, polish: string) => language === 'pl' ? polish : english, [language]);
}
