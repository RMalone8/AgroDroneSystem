import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../utils/api';

interface User {
  userId:    string;
  email:     string;
  role:      'admin' | 'client';
  createdAt: string;
}

interface Device {
  deviceId:  string;
  userId:    string;
  createdAt: string;
}

interface NewDeviceCredentials {
  deviceId:    string;
  deviceToken: string;
  userId:      string;
}

export function AdminPanel() {
  const { logout } = useAuth();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [users,   setUsers]   = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Register device form ────────────────────────────────────────────────────
  const [selectedUserId,  setSelectedUserId]  = useState('');
  const [registering,     setRegistering]     = useState(false);
  const [newDevice,       setNewDevice]       = useState<NewDeviceCredentials | null>(null);

  // ── Issue access token ──────────────────────────────────────────────────────
  const [issuingToken,    setIssuingToken]    = useState(false);
  const [newAccessToken,  setNewAccessToken]  = useState<string | null>(null);

  // ── Delete confirmation ─────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, devicesRes] = await Promise.all([
        authFetch('/admin/users'),
        authFetch('/admin/devices'),
      ]);
      const usersData:   User[]   = await usersRes.json();
      const devicesData: Device[] = await devicesRes.json();
      setUsers(usersData);
      setDevices(devicesData);
      setSelectedUserId((prev) => {
        const clients = usersData.filter((u) => u.role === 'client');
        return prev && clients.some((c) => c.userId === prev) ? prev : (clients[0]?.userId ?? '');
      });
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Register device ──────────────────────────────────────────────────────────
  async function handleRegisterDevice() {
    if (!selectedUserId) return;
    setRegistering(true);
    setNewDevice(null);
    setError(null);
    try {
      const res = await authFetch('/admin/device/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetUserId: selectedUserId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { deviceId: string; deviceToken: string };
      setNewDevice({ ...data, userId: selectedUserId });
      refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to register device');
    } finally {
      setRegistering(false);
    }
  }

  // ── Issue access token ───────────────────────────────────────────────────────
  async function handleIssueAccessToken() {
    setIssuingToken(true);
    setNewAccessToken(null);
    setError(null);
    try {
      const res = await authFetch('/admin/access-token', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const { accessToken } = await res.json();
      setNewAccessToken(accessToken);
    } catch (e: any) {
      setError(e.message ?? 'Failed to issue access token');
    } finally {
      setIssuingToken(false);
    }
  }

  // ── Delete user ──────────────────────────────────────────────────────────────
  async function handleDeleteUser(userId: string) {
    setDeleting(true);
    setError(null);
    try {
      const res = await authFetch(`/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setConfirmDeleteId(null);
      refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const clientUsers = users.filter((u) => u.role === 'client');

  function devicesFor(userId: string) {
    return devices.filter((d) => d.userId === userId);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AgroDrone Admin Panel</h1>
          <p className="text-sm text-gray-500">Manage accounts, devices, and access tokens</p>
        </div>
        <button
          onClick={logout}
          className="text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="max-w-3xl mx-auto py-10 px-6 space-y-8">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── All Accounts ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">All Accounts</h2>

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400">No accounts yet.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => {
                const userDevices = devicesFor(user.userId);
                const isConfirming = confirmDeleteId === user.userId;
                return (
                  <div
                    key={user.userId}
                    className="border border-gray-100 rounded-lg p-4 space-y-3"
                  >
                    {/* User header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{user.email}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {user.role}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 font-mono">
                          <span>ID: {user.userId}</span>
                          <span>Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Delete controls */}
                      {isConfirming ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-600">Delete account?</span>
                          <button
                            onClick={() => handleDeleteUser(user.userId)}
                            disabled={deleting}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(user.userId)}
                          className="text-xs text-gray-400 hover:text-red-600 transition-colors shrink-0"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {/* Associated edge nodes */}
                    {userDevices.length > 0 && (
                      <div className="border-t border-gray-50 pt-2 space-y-1">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Edge Node{userDevices.length > 1 ? 's' : ''}
                        </p>
                        {userDevices.map((d) => (
                          <div key={d.deviceId} className="flex items-center gap-3 text-xs font-mono text-gray-600">
                            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                            <span>{d.deviceId}</span>
                            <span className="text-gray-400 font-sans">
                              registered {new Date(d.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {user.role === 'client' && userDevices.length === 0 && (
                      <p className="text-xs text-gray-400 border-t border-gray-50 pt-2">
                        No edge node registered yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Register Edge Node ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Register Edge Node</h2>
          <p className="text-sm text-gray-500">
            Select the client this device belongs to. The returned token is shown once — copy it
            to the edge node's <code className="bg-gray-100 px-1 rounded">.env</code> file.
          </p>

          {clientUsers.length === 0 ? (
            <p className="text-sm text-gray-400">No client accounts yet. Issue an access token first.</p>
          ) : (
            <div className="flex gap-3">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {clientUsers.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.email}</option>
                ))}
              </select>
              <button
                onClick={handleRegisterDevice}
                disabled={registering || !selectedUserId}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {registering ? 'Registering…' : 'Register Device'}
              </button>
            </div>
          )}

          {newDevice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-semibold text-green-800">
                Device registered — copy these values now. The token will not be shown again.
              </p>
              <div className="font-mono bg-white border border-green-200 rounded p-3 space-y-1 text-xs">
                <div><span className="text-gray-500">DEVICE_ID=</span>{newDevice.deviceId}</div>
                <div><span className="text-gray-500">DEVICE_TOKEN=</span>{newDevice.deviceToken}</div>
                <div><span className="text-gray-500">USER_ID=</span>{newDevice.userId}</div>
              </div>
            </div>
          )}
        </section>

        {/* ── Issue Access Token ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Issue Client Access Token</h2>
          <p className="text-sm text-gray-500">
            Generate a one-time token to share with a new customer so they can create their account.
          </p>
          <button
            onClick={handleIssueAccessToken}
            disabled={issuingToken}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {issuingToken ? 'Generating…' : 'Generate Access Token'}
          </button>

          {newAccessToken && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
              <p className="font-semibold text-yellow-800 mb-1">
                Share this token with the client — it can only be used once.
              </p>
              <code className="font-mono bg-white border border-yellow-200 rounded px-3 py-2 block text-xs break-all">
                {newAccessToken}
              </code>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
