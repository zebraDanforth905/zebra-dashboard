'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { formatDate } from '@/app/lib/utils';
import CustomerNoteCell from './customer-note-cell';


interface ExpiringCard {
  recurring_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  exp_date: string;
  amount: string;
  billing_cycle: string;
  days_until_expiry: number;
  recent_note: {
    content: string;
    date: string;
    creator: string;
  } | null;
}

interface ExpiringCardsAlertProps {
  expiringCards: ExpiringCard[];
  currentUserName: string;
}

export default function ExpiringCardsAlert({ expiringCards, currentUserName }: ExpiringCardsAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (expiringCards.length === 0) {
    return null;
  }

  // Categorize by urgency
  const expired = expiringCards.filter(card => card.days_until_expiry < 0);
  const critical = expiringCards.filter(card => card.days_until_expiry >= 0 && card.days_until_expiry <= 7);
  const warning = expiringCards.filter(card => card.days_until_expiry > 7 && card.days_until_expiry <= 30);
  const upcoming = expiringCards.filter(card => card.days_until_expiry > 30);

//   const formatDate = (dateString: string) => {
//     const date = new Date(dateString);
//     return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
//   };

  const renderCardGroup = (cards: ExpiringCard[], title: string, bgColor: string, textColor: string, borderColor: string) => {
    if (cards.length === 0) return null;

    return (
      <div className={`${bgColor} ${borderColor} border rounded-lg p-3 mb-2`}>
        <h3 className={`text-xs font-semibold ${textColor} mb-2 flex items-center gap-1.5`}>
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          {title} ({cards.length})
        </h3>
        <div className="space-y-1.5">
          {cards.map((card) => (
            <Link
              key={card.recurring_id}
              href={`/dashboard/billing/${card.customer_id}/edit`}
              className="block bg-white rounded px-2 py-1.5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{card.customer_name}</div>
                  <div className="text-gray-500 text-[10px]">
                    Expires: {formatDate(card.exp_date)} • ${parseFloat(card.amount).toFixed(2)}/{card.billing_cycle}
                  </div>
                  {card.recent_note && (
                    <div className="mt-1">
                      <CustomerNoteCell 
                        customer={{ 
                          id: card.customer_id, 
                          name: card.customer_name,
                          recent_note: card.recent_note
                        } as any} 
                        currentUserName={currentUserName}
                      />
                    </div>
                  )}
                </div>
                <div className={`text-[10px] font-semibold ${textColor} flex-shrink-0`}>
                  {card.days_until_expiry < 0 
                    ? `${Math.abs(card.days_until_expiry)}d ago`
                    : card.days_until_expiry === 0
                    ? 'Today'
                    : `${card.days_until_expiry}d`
                  }
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-100">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors rounded-t-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
          Payment Card Expiry Alerts
          <span className="text-sm font-normal text-slate-500">
            ({expiringCards.length} card{expiringCards.length !== 1 ? 's' : ''})
          </span>
        </h2>
        {isExpanded ? (
          <ChevronUpIcon className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDownIcon className="h-5 w-5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          {renderCardGroup(expired, 'Expired Cards', 'bg-red-50', 'text-red-700', 'border-red-200')}
          {renderCardGroup(critical, 'Expiring This Week', 'bg-orange-50', 'text-orange-700', 'border-orange-200')}
          {renderCardGroup(warning, 'Expiring This Month', 'bg-yellow-50', 'text-yellow-700', 'border-yellow-200')}
          {renderCardGroup(upcoming, 'Expiring Soon (30-60 days)', 'bg-blue-50', 'text-blue-700', 'border-blue-200')}
        </div>
      )}
    </div>
  );
}
