'use client';

import { deleteUser } from '@/app/lib/actions';
import { useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  user_type: string;
};

export default function UsersList({ users }: { users: User[] }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(userId);
    setError(null);

    const formData = new FormData();
    formData.append('userId', userId);

    const result = await deleteUser(formData);

    if (!result.ok) {
      setError(result.error || 'Failed to delete user');
    }

    setDeletingId(null);
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
                    {user.user_type}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                  {user.user_type !== 'admin' ? (
                    <button
                      onClick={() => handleDelete(user.id, user.name)}
                      disabled={deletingId === user.id}
                      className="text-red-600 hover:text-red-800 font-medium disabled:text-gray-400"
                    >
                      {deletingId === user.id ? 'Deleting...' : 'Delete'}
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs">Protected</span>
                  )}
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
