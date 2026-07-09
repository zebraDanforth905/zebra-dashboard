'use client';

import { adminUpdateUserPassword, deleteUser } from '@/app/lib/actions';
import { useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  user_type: string;
};

function userTypeLabel(userType: string) {
  return userType === 'admin' ? 'Admin' : 'Coach';
}

export default function UsersList({ users }: { users: User[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPasswordId, setUpdatingPasswordId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete(userId: string) {

    setDeletingId(userId);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append('userId', userId);

    const result = await deleteUser(formData);

    if (!result.ok) {
      setError(result.error || 'Failed to delete user');
    }

    setDeletingId(null);
  }

  function openPasswordModal(user: User) {
    setError(null);
    setMessage(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordUser(user);
  }

  function closePasswordModal() {
    if (updatingPasswordId) return;
    setPasswordUser(null);
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handlePasswordUpdate() {
    if (!passwordUser) return;
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setUpdatingPasswordId(passwordUser.id);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    formData.append('userId', passwordUser.id);
    formData.append('newPassword', newPassword);

    const result = await adminUpdateUserPassword(formData);
    if (result.ok) {
      setMessage(`Password updated for ${passwordUser.name}.`);
      setPasswordUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(result.error || 'Failed to update password');
    }

    setUpdatingPasswordId(null);
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
        <table className="min-w-full divide-y divide-gray-200">
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
                    {userTypeLabel(user.user_type)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openPasswordModal(user)}
                      disabled={updatingPasswordId === user.id || deletingId === user.id}
                      className="font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                    >
                      Change Password
                    </button>
                    {user.user_type !== 'admin' ? (
                      <button
                        type="button"
                      onClick={() => handleDelete(user.id)}
                        disabled={deletingId === user.id || updatingPasswordId === user.id}
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
        Total users: {users.length} ({users.filter(u => u.user_type === 'admin').length} admin, {users.filter(u => u.user_type !== 'admin').length} coach)
      </div>

      {passwordUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-user-password-title"
        >
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h2 id="change-user-password-title" className="text-lg font-semibold text-gray-900">
                  Change Password
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Set a new password for {passwordUser.name}.
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={Boolean(updatingPasswordId)}
                className="rounded-md px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                aria-label="Close password modal"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label htmlFor="admin-new-password" className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  id="admin-new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={6}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={Boolean(updatingPasswordId)}
                />
              </div>
              <div>
                <label htmlFor="admin-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="admin-confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={6}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={Boolean(updatingPasswordId)}
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={Boolean(updatingPasswordId)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasswordUpdate}
                  disabled={Boolean(updatingPasswordId) || newPassword.length < 6 || confirmPassword.length < 6}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {updatingPasswordId ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
