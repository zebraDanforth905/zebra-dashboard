import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import UpdatePasswordForm from '@/app/ui/settings/update-password-form';

export const metadata = {
  title: 'Settings | Dashboard',
};

export default async function SettingsPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user as any;

  return (
    <div className="p-6 max-w-2xl mx-auto">
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
                {user.user_type}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Change Password</h2>
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
