'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Children } from 'react';
import postgres from 'postgres';


export default function Sorter({sortString, children} : {sortString: string, children: React.ReactNode}) {

    const pathname = usePathname();
    const searchParams = useSearchParams();
    const incDec = !(searchParams.get('incDec') === 'true');

    const createSortURL = (sortBy: string, incDec:boolean) => {
            
            const params = new URLSearchParams(searchParams);

            params.set('sortBy', sortBy);
            params.set('incDec', incDec.toString());
            
            return `${pathname}?${params.toString()}`;
        };

    return <Link href={createSortURL(sortString, incDec)}>{children}</Link>;

}