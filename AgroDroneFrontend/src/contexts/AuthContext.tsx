import { createContext, useContext, useState, ReactNode } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

const TOKEN_KEY      = 'agro_token';
const USERID_KEY     = 'agro_userId';
const ROLE_KEY       = 'agro_role';
const MQTT_TOKEN_KEY = 'agro_mqttToken';

export type UserRole = 'admin' | 'client';

interface AuthState {
  token:      string | null;
  userId:     string | null;
  role:       UserRole | null;
  mqttToken:  string | null;
}

interface AuthContextValue extends AuthState {
  login:    (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, accessToken: string) => Promise<void>;
  logout:   () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token:     localStorage.getItem(TOKEN_KEY),
    userId:    localStorage.getItem(USERID_KEY),
    role:      (localStorage.getItem(ROLE_KEY) as UserRole) ?? null,
    mqttToken: localStorage.getItem(MQTT_TOKEN_KEY),
  }));

  function persist(token: string, userId: string, role: UserRole, mqttToken: string) {
    localStorage.setItem(TOKEN_KEY,      token);
    localStorage.setItem(USERID_KEY,     userId);
    localStorage.setItem(ROLE_KEY,       role);
    localStorage.setItem(MQTT_TOKEN_KEY, mqttToken);
    setAuth({ token, userId, role, mqttToken });
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERID_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(MQTT_TOKEN_KEY);
    setAuth({ token: null, userId: null, role: null, mqttToken: null });
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'Login failed');
    const data = await res.json() as {
      token: string; userId: string; role: UserRole; mqttToken: string;
    };
    persist(data.token, data.userId, data.role ?? 'client', data.mqttToken ?? '');
  }

  async function register(email: string, password: string, accessToken: string) {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, accessToken }),
    });
    if (!res.ok) throw new Error((await res.text()) || 'Registration failed');
    const data = await res.json() as {
      token: string; userId: string; role: UserRole; mqttToken: string;
    };
    persist(data.token, data.userId, data.role ?? 'client', data.mqttToken ?? '');
  }

  return (
    <AuthContext.Provider value={{ ...auth, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
