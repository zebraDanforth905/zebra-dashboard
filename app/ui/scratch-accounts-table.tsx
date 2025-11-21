import { fetchAllAccountsManagement, fetchAccountsManagementPages } from '@/app/lib/data';
import ScratchAccountsSearch from './scratch-accounts-search';
import ScratchAccountRow from './scratch-account-row';
import Pagination from './pagination';

export default async function ScratchAccountsTable({ 
  query, 
  unassignedOnly,
  currentPage 
}: { 
  query: string; 
  unassignedOnly: boolean;
  currentPage: number;
}) {
  const accounts = await fetchAllAccountsManagement(query, unassignedOnly, currentPage);
  const totalPages = await fetchAccountsManagementPages(query, unassignedOnly);



  return (
    <div className="space-y-4">
      <ScratchAccountsSearch query={query} unassignedOnly={unassignedOnly} />

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username/Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Password
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assigned Student
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map((account) => (
              <ScratchAccountRow 
                key={`${account.account_type}-${account.username}-${account.student_id || 'unassigned'}`} 
                account={account}
              />
            ))}
          </tbody>
        </table>
        
        {accounts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No scratch accounts found.
          </div>
        )}
      </div>

      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
