'use client';

import { adminSetTemporaryPassword, deleteUser } from '@/app/lib/actions';
import { useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  user_type: string;
  status: string;
  last_login_at: Date | string | null;
  login_count: number;
  failed_login_count: number;
  locked_until: Date | string | null;
};

export default function UsersList({ users }: { users: User[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function formatDate(value: Date | string | null) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  async function handleDelete(userId: string) {
    setDeletingId(userId);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('userId', userId);

    const result = await deleteUser(formData);

    if (!result.ok) {
      setError(result.error || 'Failed to delete user');
    } else {
      setSuccess(result.message || 'User deleted');
    }

    setDeletingId(null);
  }

  async function handleTemporaryPassword(formData: FormData) {
    const userId = String(formData.get('userId') ?? '');
    setResettingId(userId);
    setError(null);
    setSuccess(null);

    const result = await adminSetTemporaryPassword(formData);
    if (!result.ok) {
      setError(result.error || 'Failed to set temporary password');
    } else {
      setSuccess(result.message || 'Temporary password set');
      const form = document.getElementById(`password-reset-${userId}`) as HTMLFormElement | null;
      form?.reset();
    }

    setResettingId(null);
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
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Login Count
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {user.name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {user.email}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.user_type === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {user.user_type}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : user.status === 'locked'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }`}>
                    {user.status}
                  </span>
                  {user.locked_until && (
                    <div className="mt-1 text-xs text-gray-500">until {formatDate(user.locked_until)}</div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {formatDate(user.last_login_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {user.login_count}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {user.failed_login_count}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  <div className="flex flex-col items-end gap-2">
                    <form
                      id={`password-reset-${user.id}`}
                      action={handleTemporaryPassword}
                      className="flex justify-end gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input
                        type="password"
                        name="temporaryPassword"
                        minLength={8}
                        required
                        placeholder="Temp password"
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={resettingId === user.id}
                        className="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:bg-gray-400"
                      >
                        {resettingId === user.id ? 'Setting...' : 'Set Temp'}
                      </button>
                    </form>
                    {user.user_type !== 'admin' ? (
                      <button
                      onClick={() => handleDelete(user.id)}
                      disabled={deletingId === user.id}
                      className="text-red-600 hover:text-red-800 font-medium disabled:text-gray-400"
                    >
                      {deletingId === user.id ? 'Deleting...' : 'Delete'}
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs">Protected</span>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total users: {users.length} ({users.filter(u => u.user_type === 'admin').length} admin, {users.filter(u => u.user_type !== 'admin').length} regular)
      </div>
    </div>
  );
}
