'use client';

import { EnrollmentReportRow } from '@/app/lib/enrollment-report';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';

type Props = {
  enrollments: EnrollmentReportRow[];
  startDate: string;
  endDate: string;
};

export default function EnrollmentReportTable({ enrollments, startDate, endDate }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);

  const handleDateChange = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('startDate', localStartDate);
    params.set('endDate', localEndDate);
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Group enrollments by customer
  const groupedEnrollments = enrollments.reduce((acc, enrollment) => {
    if (!acc[enrollment.customer_id]) {
      acc[enrollment.customer_id] = {
        customer: {
          id: enrollment.customer_id,
          name: enrollment.customer_name,
          email: enrollment.customer_email,
        },
        recurring_invoice: enrollment.recurring_invoice_id ? {
          id: enrollment.recurring_invoice_id,
          amount: enrollment.recurring_invoice_amount,
          description: enrollment.recurring_invoice_description,
          next_date: enrollment.recurring_invoice_next_date,
        } : null,
        enrollments: [],
      };
    }
    acc[enrollment.customer_id].enrollments.push(enrollment);
    return acc;
  }, {} as Record<string, {
    customer: { id: string; name: string; email: string };
    recurring_invoice: { id: string; amount: number | null; description: string | null; next_date: Date | null } | null;
    enrollments: EnrollmentReportRow[];
  }>);

  const customerGroups = Object.values(groupedEnrollments);

  return (
    <div>
      {/* Date Range Filter */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="endDate" className="block text-sm font-medium text-slate-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <button
            onClick={handleDateChange}
            disabled={isPending}
            className={clsx(
              "px-4 py-2 bg-sky-600 text-white rounded-md shadow-sm hover:bg-sky-700",
              "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {isPending ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-700">
          Found <span className="font-semibold text-slate-900">{enrollments.length}</span> enrollment(s) 
          from <span className="font-semibold">{customerGroups.length}</span> customer(s)
          {' '}between{' '}
          <span className="font-semibold">{new Date(startDate).toLocaleDateString()}</span>
          {' '}and{' '}
          <span className="font-semibold">{new Date(endDate).toLocaleDateString()}</span>
        </p>
      </div>

      {/* Enrollments Table */}
      {customerGroups.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">No enrollments found for the selected date range.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {customerGroups.map((group) => (
            <div key={group.customer.id} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {/* Customer Header */}
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{group.customer.name}</h3>
                    <p className="text-sm text-slate-600">{group.customer.email}</p>
                  </div>
                  {group.recurring_invoice && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">
                        Recurring Invoice: ${((group.recurring_invoice.amount || 0) / 100).toFixed(2)}/month
                      </p>
                      {group.recurring_invoice.description && (
                        <p className="text-xs text-slate-600">{group.recurring_invoice.description}</p>
                      )}
                      {group.recurring_invoice.next_date && (
                        <p className="text-xs text-slate-600">
                          Next: {new Date(group.recurring_invoice.next_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Enrollments Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Student
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Course
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Session
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Start Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                        Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {group.enrollments.map((enrollment) => (
                      <tr key={enrollment.enrolment_id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-slate-900">{enrollment.student_name}</div>
                          {enrollment.student_dob && (
                            <div className="text-xs text-slate-600">
                              DOB: {new Date(enrollment.student_dob).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                          {enrollment.course_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-slate-900">{enrollment.session_weekday}</div>
                          <div className="text-xs text-slate-600">{enrollment.session_time}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                          {new Date(enrollment.enrolment_start_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 text-right font-medium">
                          ${Number(enrollment.course_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-right text-sm text-slate-900">
                        New Enrollments Subtotal:
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 text-right">
                        ${group.enrollments.reduce((sum, e) => sum + Number(e.course_price), 0).toFixed(2)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-right text-sm text-slate-900">
                        Total Expected Monthly (All Enrollments + Pickups):
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 text-right">
                        ${Number(group.enrollments[0].customer_total_expected).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
