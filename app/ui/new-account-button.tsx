'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { createScratchAccount, createRobloxAccount, createLaptopAssignment } from '@/app/lib/actions';
import { fetchStudentsForAssignment } from '@/app/lib/data';

export default function NewAccountButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [accountType, setAccountType] = useState<'scratch' | 'roblox' | 'laptop'>('scratch');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [laptopNumber, setLaptopNumber] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (studentQuery.length >= 2) {
      const fetchStudents = async () => {
        const data = await fetchStudentsForAssignment(studentQuery);
        setStudents(data);
        setShowDropdown(true);
      };
      fetchStudents();
    } else {
      setStudents([]);
      setShowDropdown(false);
    }
  }, [studentQuery]);

  const handleStudentSelect = (id: string, name: string) => {
    setStudentId(id);
    setStudentQuery(name);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (accountType === 'scratch') {
        if (!username || !password) {
          setError('Username and password are required');
          setIsSubmitting(false);
          return;
        }
        await createScratchAccount(username, password, studentId || null);
      } else if (accountType === 'roblox') {
        if (!username || !password) {
          setError('Username and password are required');
          setIsSubmitting(false);
          return;
        }
        await createRobloxAccount(username, password, studentId || null);
      } else if (accountType === 'laptop') {
        if (!laptopNumber) {
          setError('Laptop number is required');
          setIsSubmitting(false);
          return;
        }
        if (!studentId) {
          setError('Student assignment is required for laptops');
          setIsSubmitting(false);
          return;
        }
        await createLaptopAssignment(laptopNumber, studentId);
      }

      // Reset form and close modal
      setUsername('');
      setPassword('');
      setLaptopNumber('');
      setStudentId('');
      setStudentQuery('');
      setIsOpen(false);
      window.location.reload();
    } catch (err) {
      setError('Failed to create account. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setUsername('');
    setPassword('');
    setLaptopNumber('');
    setStudentId('');
    setStudentQuery('');
    setError('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        <PlusIcon className="h-5 w-5" />
        New Account
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Create New Account</h2>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={isSubmitting}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('scratch')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      accountType === 'scratch'
                        ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                    disabled={isSubmitting}
                  >
                    Scratch
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('roblox')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      accountType === 'roblox'
                        ? 'bg-red-100 text-red-800 border-2 border-red-300'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                    disabled={isSubmitting}
                  >
                    Roblox
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('laptop')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      accountType === 'laptop'
                        ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                    disabled={isSubmitting}
                  >
                    Laptop
                  </button>
                </div>
              </div>

              {accountType === 'laptop' ? (
                <>
                  <div>
                    <label htmlFor="laptopNumber" className="block text-sm font-medium text-gray-700 mb-1">
                      Laptop Number
                    </label>
                    <input
                      type="text"
                      id="laptopNumber"
                      value={laptopNumber}
                      onChange={(e) => setLaptopNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., LAPTOP-001"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="studentSearch" className="block text-sm font-medium text-gray-700 mb-1">
                      Assign to Student <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="studentSearch"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search for student..."
                        disabled={isSubmitting}
                        required
                      />
                      {showDropdown && students.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                          {students.map((student: any) => (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => handleStudentSelect(student.id, student.name)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                              disabled={isSubmitting}
                            >
                              <div className="font-medium">{student.name}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter username"
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter password"
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="studentSearchOptional" className="block text-sm font-medium text-gray-700 mb-1">
                      Assign to Student <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="studentSearchOptional"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Search for student..."
                        disabled={isSubmitting}
                      />
                      {showDropdown && students.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                          {students.map((student: any) => (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() => handleStudentSelect(student.id, student.name)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                              disabled={isSubmitting}
                            >
                              <div className="font-medium">{student.name}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
