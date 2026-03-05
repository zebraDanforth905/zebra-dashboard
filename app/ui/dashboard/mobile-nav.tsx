'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import GlobalStudentSearch from '../global-student-search';

const links = [
  { name: 'Schedule', href: '/dashboard/schedule' },
  { name: 'Camps', href: '/dashboard/camp' },
  { name: 'Billing', href: '/dashboard/billing', adminOnly: true },
  { name: 'Slips', href: '/dashboard/printable' },
  { name: 'Accounts', href: '/dashboard/scratch-accounts' },
  { name: 'Admin', href: '/dashboard/admin/users', adminOnly: true },
  { name: 'Incidents', href: '/dashboard/admin/incident-reports', adminOnly: true },
  { name: 'Settings', href: '/dashboard/settings' }
];

type MobileNavProps = {
  signOutAction: () => Promise<void>;
  userType?: string;
};

export default function MobileNav({ signOutAction, userType }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isAdmin = userType === 'admin';

  return (
    <>
      {/* Top navigation bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 shadow-lg md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/favicon.ico"
              alt="Logo"
              className="h-8 w-8 rounded-full bg-black/20 p-1"
              width={32}
              height={32}
            />
            <span className="text-white/95 font-semibold drop-shadow">Dashboard</span>
          </Link>
          
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="fixed top-14 left-0 right-0 z-50 bg-white shadow-xl rounded-b-2xl md:hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <nav className="p-4 space-y-2">
              {/* Global Student Search */}
              <div className="mb-4">
                <GlobalStudentSearch />
              </div>

              {links.map((link) => {
                // Skip admin-only links for non-admin users
                if (link.adminOnly && !isAdmin) {
                  return null;
                }
                
                const active = pathname === link.href || pathname.startsWith(link.href + '/');
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={clsx(
                      'block px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                      active
                        ? 'bg-sky-100 text-blue-600'
                        : 'bg-gray-50 text-slate-700 hover:bg-sky-50 hover:text-blue-600'
                    )}
                  >
                    {link.name}
                  </Link>
                );
              })}
              
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-gray-50 text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
                >
                  Sign Out
                </button>
              </form>
            </nav>
          </div>
        </>
      )}

      {/* Spacer for fixed nav */}
      <div className="h-14 md:hidden" />
    </>
  );
}
