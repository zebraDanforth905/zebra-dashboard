import SideNav from '../ui/dashboard/sidenav';
import { Metadata } from 'next';


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col md:flex-row print:block print:h-auto">
      <div className="w-full flex-none md:w-64 print:hidden">
        <SideNav />
      </div>
      <div className="flex-grow overflow-y-auto print:p-0 print:overflow-visible print:h-auto">{children}</div>
    </div>
  );
}