import { auth } from '@/auth';
import { getAllUsers } from '@/app/lib/actions';
import { redirect } from 'next/navigation';
import CreateUserForm from '@/app/ui/admin/create-user-form';
import UsersList from '@/app/ui/admin/users-list';

export const metadata = {
  title: 'User Management | Admin',
};

export default async function AdminUsersPage() {
  const session = await auth();
  const userType = (session?.user as any)?.user_type;

  // Redirect non-admin users
  if (userType !== 'admin') {
    redirect('/dashboard');
  }

  const result = await getAllUsers();

  if (!result.ok) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">User Management</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Error loading users: {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">User Management</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User Form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Create New User</h2>
            <CreateUserForm />
          </div>
        </div>

        {/* Users List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">All Users</h2>
            <UsersList users={result.users || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
