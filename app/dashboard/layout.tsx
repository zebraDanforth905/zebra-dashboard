import SideNav from '../ui/dashboard/sidenav';
import MobileNav from '../ui/dashboard/mobile-nav';
import { Metadata } from 'next';
import { signOut, auth } from '@/auth';
import IncidentReportButton from '../ui/incident-report-button';


export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userType = (session?.user as any)?.user_type;

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
        <SideNav userType={userType} />
      </div>
      
      <div className="flex-grow overflow-y-auto print:p-0 print:overflow-visible print:h-auto">{children}</div>
      
      {/* Incident Report Button - available on all pages */}
      <IncidentReportButton />
    </div>
  );
}