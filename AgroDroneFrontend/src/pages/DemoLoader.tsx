import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useMode } from '../contexts/ModeContext';
import logo from '../assets/agrodronelogo.png';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

type View  = 'token_input' | 'loading';
type Stage = 'starting' | 'account_ready' | 'edge_starting' | 'ready' | 'error';

const STAGE_LABELS: Record<Stage, string> = {
  starting:      'Creating your demo environment\u2026',
  account_ready: 'Account ready \u2014 starting edge node\u2026',
  edge_starting: 'Edge node starting \u2014 connecting drone\u2026',
  ready:         'Drone connected!',
  error:         'Something went wrong',
};

const STAGE_PROGRESS: Record<Stage, number> = {
  starting:      15,
  account_ready: 40,
  edge_starting: 70,
  ready:         100,
  error:         100,
};

export function DemoLoader() {
  const { login }   = useAuth();
  const { setMode } = useMode();

  const [view, setView]           = useState<View>('token_input');
  const [tokenInput, setTokenInput] = useState('');
  const [stage, setStage]         = useState<Stage>('starting');
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const sessionRef = useRef<{ id: string; email: string; password: string } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Holds the typed token so retry can reuse it without re-showing the input form
  const tokenRef   = useRef('');

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // Clear stale session ID on mount so a page-refresh starts fresh
  useEffect(() => {
    localStorage.removeItem('agro_demo_session_id');
    return stopPolling;
  }, []);

  async function startDemo(token: string) {
    setView('loading');
    setStage('starting');
    setErrorMsg(null);

    try {
      const res = await fetch(`${BACKEND_URL}/demo/start`, {
        method:  'POST',
        headers: { 'X-Demo-Token': token },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` })) as { detail?: string };
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { sessionId: string; email: string; password: string };
      sessionRef.current = { id: data.sessionId, email: data.email, password: data.password };
      localStorage.setItem('agro_demo_session_id', data.sessionId);
      setStage('account_ready');
      pollStatus(data.sessionId);
    } catch (err: unknown) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start demo');
    }
  }

  function pollStatus(sessionId: string) {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/demo/status/${sessionId}`);
        if (!res.ok) return;
        const { status } = await res.json() as { status: string };

        if (status === 'account_ready')  setStage('account_ready');
        else if (status === 'edge_starting') setStage('edge_starting');
        else if (status === 'ready') {
          stopPolling();
          setStage('ready');
          await new Promise(r => setTimeout(r, 800));
          const sess = sessionRef.current!;
          await login(sess.email, sess.password);
        } else if (status === 'error') {
          stopPolling();
          setStage('error');
          setErrorMsg('The demo environment encountered an error. Please try again.');
        }
      } catch {
        // transient network error — keep polling
      }
    }, 1500);
  }

  function handleTokenSubmit(e: FormEvent) {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    tokenRef.current = token;
    startDemo(token);
  }

  function handleRetry() {
    stopPolling();
    startDemo(tokenRef.current);
  }

  function handleBackToHome() {
    stopPolling();
    localStorage.removeItem('agro_demo_session_id');
    setMode(null);
  }

  // ── Token input screen ──────────────────────────────────────────────────────

  if (view === 'token_input') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="AgroDrone logo" className="h-20 w-20 mb-4 drop-shadow-md" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">AgroDrone Demo</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter your demo access token to continue</p>
          </div>

          <form onSubmit={handleTokenSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Demo Access Token
            </label>
            <input
              type="text"
              required
              autoFocus
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="AGRO-DEMO-XXXX"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <button
              type="submit"
              className="w-full bg-green-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-green-700 active:scale-95 transition-all"
            >
              Launch Demo
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleBackToHome}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / progress screen ───────────────────────────────────────────────

  const progress   = STAGE_PROGRESS[stage];
  const isError    = stage === 'error';
  const isComplete = stage === 'ready';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">

        <div className="flex flex-col items-center mb-10">
          <img
            src={logo}
            alt="AgroDrone logo"
            className={`h-20 w-20 mb-4 drop-shadow-md transition-all duration-700 ${isComplete ? 'scale-110' : 'animate-pulse'}`}
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">AgroDrone Demo</h1>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-in-out ${
                isError ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className={`text-sm font-medium mb-6 transition-all duration-300 ${
          isError
            ? 'text-red-600 dark:text-red-400'
            : isComplete
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-600 dark:text-gray-300'
        }`}>
          {STAGE_LABELS[stage]}
        </p>

        {!isError && !isComplete && (
          <div className="flex justify-center gap-1.5 mb-6">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        {isError && errorMsg && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-4">
            {errorMsg}
          </p>
        )}

        {isError && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRetry}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 active:scale-95 transition-all"
            >
              Try again
            </button>
            <button
              onClick={handleBackToHome}
              className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-2 transition-colors"
            >
              Back to home
            </button>
          </div>
        )}

        {!isError && (
          <button
            onClick={handleBackToHome}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
