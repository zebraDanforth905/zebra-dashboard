// app/ui/dashboard/nav-links.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

// Central link registry (db-backed later if desired)
const links = [
  { name: 'Home', href: '/dashboard'},
  { name: 'Billing', href: '/dashboard/billing' },
  { name: 'Students', href: '/dashboard/students' },
  { name: 'Schedule', href: '/dashboard/schedule' },
   { name: 'Camp', href: '/dashboard/camp' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              'flex h-[48px] grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3',
              {
                'bg-sky-100 text-blue-600': pathname === link.href,
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
