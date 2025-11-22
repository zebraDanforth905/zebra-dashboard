'use client';

import { useState, useEffect } from 'react';
import { assignStudentToCustomer, createCustomer } from '@/app/lib/actions';

type Enrolment = {
  id: string;
  course_name: string;
  weekday: string;
  start_time: string;
  end_time: string;
};

type UnassignedStudent = {
  id: string;
  name: string;
  enrolments: Enrolment[];
};

type Customer = {
  id: string;
  name: string;
  email: string;
};

type Props = {
  students: UnassignedStudent[];
  customers: Customer[];
};

export default function UnassignedStudents({ students: initialStudents, customers: initialCustomers }: Props) {
  const [students, setStudents] = useState(initialStudents);
  const [customers, setCustomers] = useState(initialCustomers);
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [showDropdowns, setShowDropdowns] = useState<Record<string, boolean>>({});
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStudentId, setModalStudentId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Filter customers based on search term for each student
  const getFilteredCustomers = (studentId: string) => {
    const searchTerm = searchTerms[studentId]?.toLowerCase() || '';
    if (!searchTerm || searchTerm.length < 2) return [];
    
    return customers.filter(customer => 
      customer.name.toLowerCase().includes(searchTerm) ||
      customer.email.toLowerCase().includes(searchTerm)
    ).slice(0, 10); // Limit to 10 results
  };

  function selectCustomer(studentId: string, customerId: string, customerName: string) {
    setSelectedCustomers(prev => ({
      ...prev,
      [studentId]: customerId
    }));
    setSearchTerms(prev => ({
      ...prev,
      [studentId]: customerName
    }));
    setShowDropdowns(prev => ({
      ...prev,
      [studentId]: false
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

  async function handleAssign(studentId: string) {
    const customerId = selectedCustomers[studentId];
    if (!customerId) {
      setMessage({ type: 'error', text: 'Please select a customer first.' });
      return;
    }

    setAssigning(prev => ({ ...prev, [studentId]: true }));
    setMessage(null);

    try {
      await assignStudentToCustomer(studentId, customerId);
      
      // Remove the assigned student from the list
      setStudents(prev => prev.filter(s => s.id !== studentId));
      
      // Clear selection
      setSelectedCustomers(prev => {
        const { [studentId]: _, ...rest } = prev;
        return rest;
      });
      setSearchTerms(prev => {
        const { [studentId]: _, ...rest } = prev;
        return rest;
      });
      
      setMessage({ type: 'success', text: 'Student assigned successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to assign student.' });
      console.error(error);
    } finally {
      setAssigning(prev => ({ ...prev, [studentId]: false }));
    }
  }

  function openNewCustomerModal(studentId: string) {
    setModalStudentId(studentId);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setModalStudentId(null);
    setNewCustomerName('');
    setNewCustomerEmail('');
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerName.trim() || !modalStudentId) return;

    setCreatingCustomer(true);
    try {
      const newCustomer = await createCustomer(newCustomerName, newCustomerEmail);
      
      // Add new customer to list
      setCustomers(prev => [...prev, newCustomer]);
      
      // Auto-select the new customer for this student and set search term
      setSelectedCustomers(prev => ({
        ...prev,
        [modalStudentId]: newCustomer.id
      }));
      
      setSearchTerms(prev => ({
        ...prev,
        [modalStudentId]: newCustomer.name
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

  if (students.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200">
        <h3 className="text-base font-semibold text-slate-900">
          Unassigned Students ({students.length})
        </h3>
        <p className="text-xs text-slate-600 mt-1">
          Students with enrolments who need to be assigned to a customer
        </p>
      </div>

      {message && (
        <div className={`mx-4 mt-4 p-3 rounded-lg text-sm ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
        {students.map((student) => {
          const filteredCustomers = getFilteredCustomers(student.id);
          const searchTerm = searchTerms[student.id] || '';
          const isAssigning = assigning[student.id] || false;
          
          return (
            <div key={student.id} className="p-3 hover:bg-slate-50">
              <div className="flex flex-col gap-3">
                {/* Top row: Student Info, Search, and Actions */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  {/* Student Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">{student.name}</div>
                    <div className="text-xs text-slate-500">ID: {student.id}</div>
                  </div>

                  {/* Customer Search/Select */}
                  <div className="relative flex-1 autocomplete-container">
                    <input
                      type="text"
                      placeholder="Search customer..."
                      value={searchTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSearchTerms(prev => ({ ...prev, [student.id]: value }));
                        // Show dropdown if search term is long enough
                        if (value.length >= 2) {
                          setShowDropdowns(prev => ({ ...prev, [student.id]: true }));
                        } else {
                          setShowDropdowns(prev => ({ ...prev, [student.id]: false }));
                        }
                        // Clear selection when user types after selecting
                        if (selectedCustomers[student.id]) {
                          setSelectedCustomers(prev => {
                            const { [student.id]: _, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                      onFocus={() => {
                        if (searchTerm.length >= 2) {
                          setShowDropdowns(prev => ({ ...prev, [student.id]: true }));
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    
                    {/* Autocomplete dropdown */}
                    {showDropdowns[student.id] && filteredCustomers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            onClick={() => selectCustomer(student.id, customer.id, customer.name)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50 focus:bg-sky-50 focus:outline-none border-b border-slate-100 last:border-b-0"
                          >
                            <div className="font-medium text-slate-900">{customer.name}</div>
                            <div className="text-xs text-slate-500">{customer.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openNewCustomerModal(student.id)}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      New
                    </button>
                    <button
                      onClick={() => handleAssign(student.id)}
                      disabled={!selectedCustomers[student.id] || isAssigning}
                      className="px-4 py-2 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAssigning ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                </div>

                {/* Enrolments/Pickups */}
                {student.enrolments && student.enrolments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {student.enrolments.map((enrolment) => (
                      <span 
                        key={enrolment.id} 
                        className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100"
                      >
                        {enrolment.course_name} - {enrolment.weekday} {enrolment.start_time}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Create New Customer</h3>
            </div>
            
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="customerName"
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Customer name"
                />
              </div>
              
              <div>
                <label htmlFor="customerEmail" className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  id="customerEmail"
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="customer@example.com"
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={creatingCustomer}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCustomerName.trim() || creatingCustomer}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingCustomer ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
