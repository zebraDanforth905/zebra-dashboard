'use client';

import { IncidentReport } from '@/app/lib/definitions';
import { useRouter, useSearchParams } from 'next/navigation';
import { updateIncidentReportStatus } from '@/app/lib/actions';
import { useState } from 'react';

type Props = {
  reports: IncidentReport[];
  currentStatus: string;
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'in progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

const STATUS_COLORS = {
  'new': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'in progress': 'bg-blue-100 text-blue-800 border-blue-300',
  'closed': 'bg-green-100 text-green-800 border-green-300',
};

export default function IncidentReportsTable({ reports, currentStatus }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  const selectedStatuses = currentStatus === 'all' ? ['all'] : currentStatus.split(',');

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams);
    
    if (status === 'all') {
      params.set('status', 'all');
    } else {
      let current = selectedStatuses.filter(s => s !== 'all');
      
      if (current.includes(status)) {
        // Remove if already selected
        current = current.filter(s => s !== status);
      } else {
        // Add to selection
        current.push(status);
      }
      
      // If nothing selected, default to new+in progress
      if (current.length === 0) {
        current = ['new', 'in progress'];
      }
      
      params.set('status', current.join(','));
    }
    
    router.push(`/dashboard/admin/incident-reports?${params.toString()}`);
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    setUpdatingId(reportId);
    try {
      const formData = new FormData();
      formData.append('reportId', reportId);
      formData.append('status', newStatus);
      
      await updateIncidentReportStatus(null, formData);
      router.refresh();
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filter Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 p-2 overflow-x-auto">
          {STATUS_OPTIONS.map((option) => {
            const isActive = option.value === 'all' 
              ? selectedStatuses.includes('all')
              : selectedStatuses.includes(option.value);
            const count = option.value === 'all' 
              ? reports.length 
              : reports.filter(r => r.status === option.value).length;
            
            return (
              <button
                key={option.value}
                onClick={() => handleStatusFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-100 text-sky-700 border border-sky-300'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                }`}
              >
                {option.label}
                {isActive && (
                  <span className="ml-2 px-2 py-0.5 bg-sky-200 text-sky-800 rounded-full text-xs">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reports Table */}
      <div className="overflow-x-auto">
        {reports.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p>No incident reports found</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                    {formatDate(report.date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                    {report.user_name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 max-w-md">
                    <div className="line-clamp-2">{report.description}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[report.status]}`}>
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <select
                      value={report.status}
                      onChange={(e) => handleStatusChange(report.id, e.target.value)}
                      disabled={updatingId === report.id}
                      className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
                    >
                      <option value="new">New</option>
                      <option value="in progress">In Progress</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary */}
      {reports.length > 0 && (
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{reports.length}</span> report(s)
          </p>
        </div>
      )}
    </div>
  );
}
