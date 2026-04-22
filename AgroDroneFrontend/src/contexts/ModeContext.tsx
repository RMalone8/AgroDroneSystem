import { createContext, useContext, useState, ReactNode } from 'react';

export type AppMode = 'account' | 'demo' | null;

interface ModeContextValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue>({ mode: null, setMode: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(
    () => (localStorage.getItem('agro_mode') as AppMode) ?? null
  );

  function setMode(m: AppMode) {
    if (m) localStorage.setItem('agro_mode', m);
    else localStorage.removeItem('agro_mode');
    setModeState(m);
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  return useContext(ModeContext);
}
