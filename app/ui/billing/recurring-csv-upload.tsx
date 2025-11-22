'use client';

import { useState, useEffect, useRef } from 'react';
import { uploadRecurringPaymentsCSV, assignRecurringPaymentToCustomer, createCustomer } from '@/app/lib/actions';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

type UnmatchedRecurring = {
  recurring_id: string;
  amount: number;
  billing_cycle: string;
  last_name: string;
  email: string;
  phone: string;
  exp_date: Date | null;
  start_date: Date | null;
  last_payment: Date | null;
  next_payment: Date | null;
  description: string;
};

type Customer = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  customers: Customer[];
};

export default function RecurringCSVUpload({ customers: initialCustomers }: Props) {
  const [uploading, setUploading] = useState(false);
  const [unmatched, setUnmatched] = useState<UnmatchedRecurring[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [showDropdowns, setShowDropdowns] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customers, setCustomers] = useState(initialCustomers);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalRecurringId, setModalRecurringId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Filter customers based on search term for each payment
  const getFilteredCustomers = (recurringId: string) => {
    const searchTerm = searchTerms[recurringId]?.toLowerCase() || '';
    if (!searchTerm || searchTerm.length < 2) return [];
    
    return customers.filter(customer => 
      customer.name.toLowerCase().includes(searchTerm) ||
      customer.email.toLowerCase().includes(searchTerm)
    ).slice(0, 10); // Limit to 10 results
  };

  const getSelectedCustomerName = (recurringId: string) => {
    const customerId = selectedCustomers[recurringId];
    if (!customerId) return '';
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : '';
  };

  function selectCustomer(recurringId: string, customerId: string, customerName: string) {
    setSelectedCustomers(prev => ({
      ...prev,
      [recurringId]: customerId
    }));
    setSearchTerms(prev => ({
      ...prev,
      [recurringId]: customerName
    }));
    setShowDropdowns(prev => ({
      ...prev,
      [recurringId]: false
    }));
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      // Check if click is outside any autocomplete dropdown
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
      const result = await uploadRecurringPaymentsCSV(text);

      if (result.unmatched.length === 0) {
        setMessage({ type: 'success', text: 'All recurring payments uploaded successfully!' });
        setUnmatched([]);
      } else {
        setMessage({ 
          type: 'success', 
          text: `Uploaded successfully! ${result.unmatched.length} entries need customer assignment.` 
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

  async function handleAssignment(recurringId: string) {
    const customerId = selectedCustomers[recurringId];
    if (!customerId) return;

    const paymentData = unmatched.find(u => u.recurring_id === recurringId);
    if (!paymentData) return;

    try {
      await assignRecurringPaymentToCustomer(recurringId, customerId, paymentData);
      setUnmatched(prev => prev.filter(u => u.recurring_id !== recurringId));
      setMessage({ type: 'success', text: 'Assignment saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to assign customer.' });
      console.error(error);
    }
  }

  function openNewCustomerModal(recurringId: string) {
    setModalRecurringId(recurringId);
    setShowModal(true);
    setNewCustomerName('');
    setNewCustomerEmail('');
  }

  function closeModal() {
    setShowModal(false);
    setModalRecurringId(null);
    setNewCustomerName('');
    setNewCustomerEmail('');
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerName.trim() || !modalRecurringId) return;

    setCreatingCustomer(true);
    try {
      const newCustomer = await createCustomer(newCustomerName, newCustomerEmail);
      
      // Add new customer to list
      setCustomers(prev => [...prev, newCustomer]);
      
      // Auto-select the new customer for this recurring payment and set search term
      setSelectedCustomers(prev => ({
        ...prev,
        [modalRecurringId]: newCustomer.id
      }));
      
      setSearchTerms(prev => ({
        ...prev,
        [modalRecurringId]: newCustomer.name
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
    <div className="space-y-4">
      {/* Upload Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Recurring Payments CSV</h2>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className="flex-1">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border file:border-slate-300
                file:text-sm file:font-medium
                file:bg-white file:text-slate-700
                hover:file:bg-slate-50
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
          
          {uploading && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <div className="animate-spin h-4 w-4 border-2 border-sky-600 border-t-transparent rounded-full" />
              Uploading...
            </div>
          )}
        </div>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-800 border border-green-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Upload a CSV file exported from Converge with recurring payment data. 
          Entries will be matched by Recurring ID to existing customers.
        </p>
      </div>

      {/* Unmatched Entries Section */}
      {unmatched.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Unmatched Recurring Payments ({unmatched.length})
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Assign each recurring payment to a customer
            </p>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {unmatched.map((payment) => {
              const filteredCustomers = getFilteredCustomers(payment.recurring_id);
              const searchTerm = searchTerms[payment.recurring_id] || '';
              
              return (
                <div key={payment.recurring_id} className="p-3">
                  {/* Compact Payment Info */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {payment.recurring_id}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            ${payment.amount.toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-600">
                            {payment.billing_cycle}
                          </span>
                        </div>
                        
                        <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                          <div className="flex gap-4">
                            <span className="font-medium">{payment.last_name}</span>
                            <span className="text-slate-500">{payment.email}</span>
                          </div>
                          {payment.description && (
                            <p className="text-slate-500 truncate">{payment.description}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Customer Search & Assignment */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      {/* Autocomplete Search */}
                      <div className="relative flex-1 autocomplete-container">
                        <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search customers..."
                          value={searchTerms[payment.recurring_id] || ''}
                          onChange={(e) => {
                            setSearchTerms(prev => ({
                              ...prev,
                              [payment.recurring_id]: e.target.value
                            }));
                            setShowDropdowns(prev => ({
                              ...prev,
                              [payment.recurring_id]: e.target.value.length >= 2
                            }));
                            // Clear selection if user types after selecting
                            if (selectedCustomers[payment.recurring_id]) {
                              setSelectedCustomers(prev => {
                                const newState = { ...prev };
                                delete newState[payment.recurring_id];
                                return newState;
                              });
                            }
                          }}
                          onFocus={() => {
                            const term = searchTerms[payment.recurring_id] || '';
                            if (term.length >= 2) {
                              setShowDropdowns(prev => ({
                                ...prev,
                                [payment.recurring_id]: true
                              }));
                            }
                          }}
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {showDropdowns[payment.recurring_id] && getFilteredCustomers(payment.recurring_id).length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {getFilteredCustomers(payment.recurring_id).map(customer => (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => selectCustomer(payment.recurring_id, customer.id, customer.name)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                              >
                                <div className="font-medium text-sm text-slate-900">{customer.name}</div>
                                {customer.email && (
                                  <div className="text-xs text-slate-500">{customer.email}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 sm:w-auto">
                        <button
                          onClick={() => handleAssignment(payment.recurring_id)}
                          disabled={!selectedCustomers[payment.recurring_id]}
                          className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Assign
                        </button>
                        
                        <button
                          onClick={() => openNewCustomerModal(payment.recurring_id)}
                          type="button"
                          className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors text-center whitespace-nowrap"
                        >
                          + New
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Create New Customer</h3>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-2">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="customerName"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Enter customer name"
                  disabled={creatingCustomer}
                />
              </div>

              <div>
                <label htmlFor="customerEmail" className="block text-sm font-medium text-slate-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="customerEmail"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="customer@example.com"
                  disabled={creatingCustomer}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={!newCustomerName.trim() || creatingCustomer}
                  className="flex-1 bg-sky-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingCustomer ? 'Creating...' : 'Create Customer'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={creatingCustomer}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
