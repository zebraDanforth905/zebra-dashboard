// app/ui/dashboard/nav-links.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

// Central link registry (db-backed later if desired)
export const links = [
  { name: 'Schedule', href: '/dashboard/schedule' },
  { name: 'My Schedule', href: '/dashboard/my-schedule' },
  { name: 'Staff Scheduling', href: '/dashboard/staff-schedule', adminOnly: true },
  { name: 'Camps', href: '/dashboard/camp' },
  { name: 'Billing', href: '/dashboard/billing', adminOnly: true },
  { name: 'Slips', href: '/dashboard/printable' },
  { name: 'Accounts', href: '/dashboard/scratch-accounts' },
  { name: 'Incidents', href: '/dashboard/admin/incident-reports', adminOnly: true },
  { name: 'Summer Reg', href: '/dashboard/summer', adminOnly: true },
  { name: 'Settings', href: '/dashboard/settings' }
];

export default function NavLinks({ userType }: { userType?: string }) {
  const pathname = usePathname();
  const isAdmin = userType === 'admin';

  return (
    <>
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
            className={clsx(
              'flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3',
              {
                'bg-sky-100 text-blue-600': active,
              },
            )}
          >
           
            <p className="md:block">{link.name}</p>
          </Link>
        );
      })}
    </>
  );
}
