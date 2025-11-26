import { formatDate } from '@/app/lib/utils';
import clsx from 'clsx';

interface ConvergePayment {
  recurring_id: string;
  customer_id: string;
  amount: string;
  billing_cycle: string;
  last_name: string;
  email: string;
  phone: string;
  exp_date: string;
  start_date: string;
  last_payment: string;
  next_payment: string;
  description: string;
}

interface CustomerConvergePaymentsProps {
  payments: ConvergePayment[];
}

export default function CustomerConvergePayments({ payments }: CustomerConvergePaymentsProps) {
  if (payments.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
        No Converge recurring payments set up
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const isExpiringSoon = payment.exp_date && new Date(payment.exp_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const isExpired = payment.exp_date && new Date(payment.exp_date) < new Date();
        return (
          <div key={payment.recurring_id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  ${parseFloat(payment.amount).toFixed(2)} / {payment.billing_cycle}
                </div>
                {payment.description && (
                  <div className="text-xs text-slate-600 mt-0.5">{payment.description}</div>
                )}
              </div>
              {isExpiringSoon && (
                <span className={clsx("inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ", isExpired ? "bg-red-50 text-red-700 border border-red-200" : "bg-orange-50 text-orange-700 border border-orange-200")}>
                  {isExpired ? 'Expired' : 'Expiring Soon'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Next Payment:</span>
                <span className="ml-1 font-medium text-slate-900">
                  {payment.next_payment ? formatDate(payment.next_payment) : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Last Payment:</span>
                <span className="ml-1 font-medium text-slate-900">
                  {payment.last_payment ? formatDate(payment.last_payment) : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Card Expires:</span>
                <span className={`ml-1 font-medium ${isExpiringSoon ? 'text-orange-600' : 'text-slate-900'}`}>
                  {payment.exp_date ? formatDate(payment.exp_date) : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Start Date:</span>
                <span className="ml-1 font-medium text-slate-900">
                  {payment.start_date ? formatDate(payment.start_date) : '—'}
                </span>
              </div>
              {payment.last_name && (
                <div>
                  <span className="text-slate-500">Name:</span>
                  <span className="ml-1 text-slate-700">{payment.last_name}</span>
                </div>
              )}
              {payment.email && (
                <div>
                  <span className="text-slate-500">Email:</span>
                  <span className="ml-1 text-slate-700">{payment.email}</span>
                </div>
              )}
              {payment.phone && (
                <div>
                  <span className="text-slate-500">Phone:</span>
                  <span className="ml-1 text-slate-700">{payment.phone}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500">ID:</span>
                <span className="ml-1 text-slate-600 font-mono text-[10px]">{payment.recurring_id}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
