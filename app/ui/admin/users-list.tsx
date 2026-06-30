'use client';

import {
  deleteUser,
  resetManagedUserPassword,
  updateManagedUser,
} from '@/app/lib/actions';
import { useMemo, useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  user_type: string;
};

type UserDraft = {
  name: string;
  email: string;
  user_type: string;
};

export default function UsersList({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId?: string | null;
}) {
  const initialDrafts = useMemo(
    () => Object.fromEntries(users.map((user) => [
      user.id,
      {
        name: user.name,
        email: user.email,
        user_type: user.user_type,
      },
    ])),
    [users],
  );

  const [drafts, setDrafts] = useState<Record<string, UserDraft>>(initialDrafts);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateDraft(userId: string, patch: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  }

  async function handleSave(user: User) {
    const draft = drafts[user.id];
    if (!draft) return;

    setBusyId(user.id);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append('userId', user.id);
    formData.append('name', draft.name);
    formData.append('email', draft.email);
    formData.append('user_type', draft.user_type);

    const result = await updateManagedUser(formData);
    if (result.ok) {
      setMessage(result.message || 'User updated.');
    } else {
      setError(result.error || 'Failed to update user.');
    }

    setBusyId(null);
  }

  async function handlePasswordReset(user: User) {
    const nextPassword = passwordDrafts[user.id]?.trim() || '';
    if (nextPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      setMessage(null);
      return;
    }

    setBusyId(user.id);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append('userId', user.id);
    formData.append('newPassword', nextPassword);

    const result = await resetManagedUserPassword(formData);
    if (result.ok) {
      setMessage(`Password reset for ${user.email}.`);
      setPasswordDrafts((current) => ({ ...current, [user.id]: '' }));
    } else {
      setError(result.error || 'Failed to reset password.');
    }

    setBusyId(null);
  }

  async function handleDelete(user: User) {
    const confirmed = window.confirm(`Delete ${user.email}? This removes their dashboard login.`);
    if (!confirmed) return;

    setBusyId(user.id);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append('userId', user.id);

    const result = await deleteUser(formData);
    if (result.ok) {
      setMessage(result.message || 'User deleted.');
    } else {
      setError(result.error || 'Failed to delete user.');
    }

    setBusyId(null);
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No users found
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Type
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                New Password
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => {
              const draft = drafts[user.id] ?? {
                name: user.name,
                email: user.email,
                user_type: user.user_type,
              };
              const isSelf = user.id === currentUserId;
              const isBusy = busyId === user.id;

              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 align-top">
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) => updateDraft(user.id, { name: event.target.value })}
                      disabled={isBusy}
                      className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="space-y-1">
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(event) => updateDraft(user.id, { email: event.target.value })}
                        disabled={isBusy}
                        className="w-64 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                      {isSelf && <div className="text-xs text-gray-500">Current account</div>}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <select
                      value={draft.user_type}
                      onChange={(event) => updateDraft(user.id, { user_type: event.target.value })}
                      disabled={isBusy}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <input
                      type="password"
                      value={passwordDrafts[user.id] ?? ''}
                      onChange={(event) => setPasswordDrafts((current) => ({
                        ...current,
                        [user.id]: event.target.value,
                      }))}
                      disabled={isBusy}
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
                      className="w-44 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleSave(user)}
                        disabled={isBusy}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePasswordReset(user)}
                        disabled={isBusy || (passwordDrafts[user.id]?.trim().length ?? 0) < 6}
                        className="rounded-md border border-blue-200 px-2 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        disabled={isBusy || isSelf}
                        className="rounded-md border border-red-200 px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total users: {users.length} ({users.filter((u) => u.user_type === 'admin').length} admin, {users.filter((u) => u.user_type !== 'admin').length} regular)
      </div>
    </div>
  );
}
