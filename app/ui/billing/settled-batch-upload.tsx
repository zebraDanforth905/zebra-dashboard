'use client';

import { useState, useEffect } from 'react';
import { uploadSettledBatchCSV, assignPaymentToCustomer, createCustomer } from '@/app/lib/actions';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

type UnmatchedPayment = {
  customer_full_name: string;
  amount: number;
  transaction_date: Date;
  description: string;
  transaction_id: string;
};

type Customer = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  customers: Customer[];
};

export default function SettledBatchCSVUpload({ customers: initialCustomers }: Props) {
  const [uploading, setUploading] = useState(false);
  const [unmatched, setUnmatched] = useState<UnmatchedPayment[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [showDropdowns, setShowDropdowns] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalPaymentId, setModalPaymentId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Filter customers based on search term for each payment
  const getFilteredCustomers = (paymentId: string) => {
    const searchTerm = searchTerms[paymentId]?.toLowerCase() || '';
    if (!searchTerm || searchTerm.length < 2) return [];
    
    return customers.filter(customer => 
      customer.name.toLowerCase().includes(searchTerm) ||
      customer.email.toLowerCase().includes(searchTerm)
    ).slice(0, 10); // Limit to 10 results
  };

  function selectCustomer(paymentId: string, customerId: string, customerName: string) {
    setSelectedCustomers(prev => ({
      ...prev,
      [paymentId]: customerId
    }));
    setSearchTerms(prev => ({
      ...prev,
      [paymentId]: customerName
    }));
    setShowDropdowns(prev => ({
      ...prev,
      [paymentId]: false
    }));
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.autocomplete-container')) {
        setShowDropdowns({});
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const text = await file.text();
      const result = await uploadSettledBatchCSV(text);

      if (result.unmatched.length === 0) {
        setMessage({ type: 'success', text: `All ${result.matched} payments uploaded successfully!` });
        setUnmatched([]);
      } else {
        setMessage({ 
          type: 'success', 
          text: `${result.matched} payments uploaded. ${result.unmatched.length} entries need customer assignment.` 
        });
        setUnmatched(result.unmatched);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to upload CSV. Please check the file format.' });
      console.error(error);
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  }

  async function handleAssignment(paymentId: string) {
    const customerId = selectedCustomers[paymentId];
    if (!customerId) return;

    const paymentData = unmatched.find(u => u.transaction_id === paymentId);
    if (!paymentData) return;

    try {
      await assignPaymentToCustomer(customerId, paymentData);
      setUnmatched(prev => prev.filter(u => u.transaction_id !== paymentId));
      setMessage({ type: 'success', text: 'Payment assigned successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to assign payment.' });
      console.error(error);
    }
  }

  function openNewCustomerModal(paymentId: string) {
    setModalPaymentId(paymentId);
    setShowModal(true);
    setNewCustomerName('');
    setNewCustomerEmail('');
  }

  function closeModal() {
    setShowModal(false);
    setModalPaymentId(null);
    setNewCustomerName('');
    setNewCustomerEmail('');
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerName.trim() || !modalPaymentId) return;

    setCreatingCustomer(true);
    try {
      const newCustomer = await createCustomer(newCustomerName, newCustomerEmail);
      
      setCustomers(prev => [...prev, newCustomer]);
      
      setSelectedCustomers(prev => ({
        ...prev,
        [modalPaymentId]: newCustomer.id
      }));
      
      setSearchTerms(prev => ({
        ...prev,
        [modalPaymentId]: newCustomer.name
      }));
      
      setMessage({ type: 'success', text: `Customer "${newCustomer.name}" created successfully!` });
      closeModal();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create customer.' });
      console.error(error);
    } finally {
      setCreatingCustomer(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload Section */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Settled Batch Payments</h3>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <label className="flex-1">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-xs text-slate-500
                file:mr-2 file:py-1 file:px-2
                file:rounded file:border file:border-slate-300
                file:text-xs file:font-medium
                file:bg-white file:text-slate-700
                hover:file:bg-slate-50
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          
          {uploading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="animate-spin h-3 w-3 border-2 border-sky-600 border-t-transparent rounded-full" />
              Uploading...
            </div>
          )}
        </div>

        {message && (
          <div className={`mt-2 p-2 rounded text-xs ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <p className="mt-2 text-[10px] text-slate-500">
          Upload SETTLEDBATCHES CSV. Matched by customer email, status &quot;submitted&quot;.
        </p>
      </div>

      {/* Unmatched Entries Section */}
      {unmatched.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-3 py-2 border-b border-slate-200">
            <h4 className="text-sm font-semibold text-slate-900">
              Unmatched Payments ({unmatched.length})
            </h4>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Assign each payment to a customer
            </p>
          </div>

          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {unmatched.map((payment) => {
              const paymentId = payment.transaction_id;
              const filteredCustomers = getFilteredCustomers(paymentId);
              const searchTerm = searchTerms[paymentId] || '';
              const showDropdown = showDropdowns[paymentId] && searchTerm.length >= 2;

              return (
                <div key={paymentId} className="p-2 hover:bg-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* Payment Info */}
                    <div className="space-y-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-medium text-slate-900">
                          {payment.customer_full_name}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          ${(payment.amount / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600">
                        <div>Date: {new Date(payment.transaction_date).toLocaleDateString()}</div>
                        {payment.description && <div className="truncate">Desc: {payment.description}</div>}
                        <div className="text-slate-400 truncate">ID: {payment.transaction_id}</div>
                      </div>
                    </div>

                    {/* Customer Assignment */}
                    <div className="space-y-1.5">
                      <div className="autocomplete-container relative">
                        <div className="relative">
                          <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={(e) => {
                              setSearchTerms(prev => ({
                                ...prev,
                                [paymentId]: e.target.value
                              }));
                              setShowDropdowns(prev => ({
                                ...prev,
                                [paymentId]: true
                              }));
                            }}
                            className="w-full pl-7 pr-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>

                        {showDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg max-h-48 overflow-y-auto">
                            {filteredCustomers.length > 0 ? (
                              filteredCustomers.map((customer) => (
                                <button
                                  key={customer.id}
                                  onClick={() => selectCustomer(paymentId, customer.id, customer.name)}
                                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-sky-50 border-b border-slate-100 last:border-b-0"
                                >
                                  <div className="font-medium text-slate-900">{customer.name}</div>
                                  {customer.email && (
                                    <div className="text-[10px] text-slate-600">{customer.email}</div>
                                  )}
                                </button>
                              ))
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-slate-500">
                                No customers found
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleAssignment(paymentId)}
                          disabled={!selectedCustomers[paymentId]}
                          className="flex-1 px-2 py-1 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => openNewCustomerModal(paymentId)}
                          className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                        >
                          New
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-3 py-2 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Create New Customer</h3>
            </div>
            
            <form onSubmit={handleCreateCustomer} className="p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter customer name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter email address"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={creatingCustomer}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCustomer || !newCustomerName.trim()}
                  className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingCustomer ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
