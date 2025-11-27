// ===============================
// Themed Side Navigation (Pattern)
// Files: app/ui/dashboard/nav-links.tsx & app/ui/dashboard/sidenav.tsx
// Matches the blue→teal gradient + soft rounded cards from the app theme.
// ===============================


// app/ui/dashboard/sidenav.tsx
import Link from 'next/link';
import NavLinks from './nav-links';
import { signOut } from '@/auth';
import Image from 'next/image';

// Optional: swap to your brand mark
function BrandMark() {
  return (
    <div className="flex items-center gap-3">
        <Image
            src="/favicon.ico"
            alt="Logo" 
            className="h-8 w-8 rounded-full bg-black/20 p-1"
            width={100}
            height={50}/>

      <span className="hidden text-white/95 md:inline-block font-semibold drop-shadow">Dashboard</span>
    </div>
  );
}

export default function SideNav({ userType }: { userType?: string }) {
  return (
    <div className="flex h-full flex-col px-3 py-4 md:px-2">
      {/* Brand strip with gradient */}
      <Link
        className="mb-2 block overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 p-4 shadow-sm md:h-40"
        href="/dashboard"
      >
        <div className="relative h-20 md:h-32">
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -top-10 left-14 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
          </div>
          <div className="absolute bottom-2 left-2">
            <BrandMark />
          </div>
          
        </div>
      </Link>

      {/* Links + filler + signout */}
      <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">
        <NavLinks userType={userType} />

        <div className="hidden h-auto w-full grow bg-white md:block" />
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button className={
            'flex h-[48px] w-full grow items-center justify-center gap-2 rounded-xl bg-white p-3 text-sm font-medium '+
            'hover:bg-sky-50 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3 cursor-pointer'
          }>

            <div className="md:block">Sign Out</div>
          </button>
        </form>
      </div>
    </div>
  );
}
