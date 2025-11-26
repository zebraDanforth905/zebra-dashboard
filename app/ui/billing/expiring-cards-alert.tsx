import Link from 'next/link';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ExpiringCard {
  recurring_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  exp_date: string;
  amount: string;
  billing_cycle: string;
  days_until_expiry: number;
}

interface ExpiringCardsAlertProps {
  expiringCards: ExpiringCard[];
}

export default function ExpiringCardsAlert({ expiringCards }: ExpiringCardsAlertProps) {
  if (expiringCards.length === 0) {
    return null;
  }

  // Categorize by urgency
  const expired = expiringCards.filter(card => card.days_until_expiry < 0);
  const critical = expiringCards.filter(card => card.days_until_expiry >= 0 && card.days_until_expiry <= 7);
  const warning = expiringCards.filter(card => card.days_until_expiry > 7 && card.days_until_expiry <= 30);
  const upcoming = expiringCards.filter(card => card.days_until_expiry > 30);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

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
              <div className="flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-gray-900">{card.customer_name}</div>
                  <div className="text-gray-500 text-[10px]">
                    Expires: {formatDate(card.exp_date)} • ${parseFloat(card.amount).toFixed(2)}/{card.billing_cycle}
                  </div>
                </div>
                <div className={`text-[10px] font-semibold ${textColor}`}>
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm ring-1 ring-slate-100 p-4">
      <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
        Payment Card Expiry Alerts
      </h2>

      {renderCardGroup(expired, 'Expired Cards', 'bg-red-50', 'text-red-700', 'border-red-200')}
      {renderCardGroup(critical, 'Expiring This Week', 'bg-orange-50', 'text-orange-700', 'border-orange-200')}
      {renderCardGroup(warning, 'Expiring This Month', 'bg-yellow-50', 'text-yellow-700', 'border-yellow-200')}
      {renderCardGroup(upcoming, 'Expiring Soon (30-60 days)', 'bg-blue-50', 'text-blue-700', 'border-blue-200')}
    </div>
  );
}
