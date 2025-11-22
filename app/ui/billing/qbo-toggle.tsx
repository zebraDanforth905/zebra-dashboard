'use client';

import { useState } from 'react';
import { toggleCustomerQBO } from '@/app/lib/actions';

type Props = {
  customerId: string;
  isSetUp: boolean;
};

export default function QBOToggle({ customerId, isSetUp }: Props) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    setToggling(true);
    try {
      await toggleCustomerQBO(customerId, isSetUp);
    } catch (error) {
      console.error('Failed to toggle QBO status:', error);
    } finally {
      setToggling(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={`
        relative z-10 inline-flex h-6 w-11 items-center rounded-full transition-colors
        focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isSetUp ? 'bg-sky-600' : 'bg-slate-300'}
      `}
      title={isSetUp ? 'QBO Set Up' : 'QBO Not Set Up'}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${isSetUp ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}
