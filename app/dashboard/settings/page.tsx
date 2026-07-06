import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { fetchCanvasApiSettings, getAllUsers } from '@/app/lib/actions';
import UpdatePasswordForm from '@/app/ui/settings/update-password-form';
import CanvasApiTokenForm from '@/app/ui/settings/canvas-api-token-form';
import CreateUserForm from '@/app/ui/admin/create-user-form';
import UsersList from '@/app/ui/admin/users-list';

export const metadata = {
  title: 'Settings | Dashboard',
};

export default async function SettingsPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user as any;
  const userType = user?.user_type;
  const isAdmin = userType === 'admin';
  const [canvasSettings, allUsersResult] = await Promise.all([
    fetchCanvasApiSettings(),
    isAdmin ? getAllUsers() : Promise.resolve(null),
  ]);
  const canvasApiSettings = canvasSettings?.ok ? canvasSettings.settings : null;
  const settingsError =
    canvasSettings && !canvasSettings.ok && typeof canvasSettings.error === 'string'
      ? canvasSettings.error
      : null;
  const adminUsers = allUsersResult?.ok ? (allUsersResult.users ?? []) : [];
  const usersError =
    isAdmin && allUsersResult && !allUsersResult.ok && typeof allUsersResult.error === 'string'
      ? allUsersResult.error
      : null;
  const accountTypeLabel = user.user_type === 'admin' ? 'Admin' : 'Coach';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Settings</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Account Information</h2>
        <div className="space-y-3">
          <div>
            <span className="text-sm font-medium text-gray-600">Name:</span>
            <p className="text-gray-900">{user.name}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-600">Email:</span>
            <p className="text-gray-900">{user.email}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-600">Account Type:</span>
            <p>
              <span
                className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                  user.user_type === 'admin'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {accountTypeLabel}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Change Password</h2>
        <UpdatePasswordForm />
      </div>

      {isAdmin && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700">User Management</h2>
          {usersError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {usersError}
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-3">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Create User</h3>
                <CreateUserForm />
              </div>
              <div className="xl:col-span-2">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Manage Users</h3>
                <UsersList users={adminUsers} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Canvas API Token</h2>
        <CanvasApiTokenForm
          configured={Boolean(canvasApiSettings?.configured)}
          source={canvasApiSettings?.source ?? 'none'}
          maskedToken={canvasApiSettings?.maskedToken ?? null}
          dashboardMaskedToken={canvasApiSettings?.dashboardMaskedToken ?? null}
          dashboardTokenStatus={canvasApiSettings?.dashboardTokenStatus ?? null}
          dashboardTokenStatusMessage={canvasApiSettings?.dashboardTokenStatusMessage ?? null}
          settingsError={settingsError}
        />
      </div>
    </div>
  );
}
