import SideNav from '../ui/dashboard/sidenav';
import MobileNav from '../ui/dashboard/mobile-nav';
import { Metadata } from 'next';
import { signOut } from '@/auth';


export default function Layout({ children }: { children: React.ReactNode }) {
  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="flex h-screen flex-col md:flex-row print:block print:h-auto">
      {/* Mobile navigation - only visible on small screens */}
      <div className="md:hidden print:hidden">
        <MobileNav signOutAction={handleSignOut} />
      </div>
      
      {/* Desktop sidebar - only visible on medium+ screens */}
      <div className="hidden md:block w-64 flex-none print:hidden">
        <SideNav />
      </div>
      
      <div className="flex-grow overflow-y-auto print:p-0 print:overflow-visible print:h-auto">{children}</div>
    </div>
  );
}