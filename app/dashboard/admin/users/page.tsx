import { getAllUsers } from '@/app/lib/actions';
import CreateUserForm from '@/app/ui/admin/create-user-form';
import UsersList from '@/app/ui/admin/users-list';
import { auth } from '@/auth';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Admin Users | Dashboard',
};

export default async function AdminUsersPage() {
  const session = await auth();
  if ((session?.user as any)?.user_type !== 'admin') {
    notFound();
  }

  const result = await getAllUsers();
  const users = result.ok ? result.users ?? [] : [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monitor logins, create staff users, and set temporary passwords.
        </p>
      </div>

      {!result.ok && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.error ?? 'Failed to load users'}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-lg border border-gray-200 bg-white p-4 xl:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Create User</h2>
          <CreateUserForm />
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Login Monitoring</h2>
          <UsersList users={users} />
        </section>
      </div>
    </div>
  );
}
