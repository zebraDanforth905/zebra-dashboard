'use client';

import { useState, useEffect, useRef } from 'react';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { assignStudent } from '@/app/lib/actions';

type Student = {
  id: number | string;
  name: string;
};

type Props = {
  customerId: string;
  allStudents: Student[];
};

export default function AddStudentButton({ customerId, allStudents }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter students based on search term
  useEffect(() => {
    if (searchTerm.trim().length === 0) {
      setFilteredStudents([]);
    } else {
      const filtered = allStudents.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStudents(filtered.slice(0, 10)); // Limit to 10 results
    }
  }, [searchTerm, allStudents]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  async function handleAssignStudent(studentId: number | string) {
    setIsAssigning(true);
    try {
      const formData = new FormData();
      formData.append('customer_id', customerId);
      formData.append('student_id', String(studentId));
      await assignStudent(formData);
      
      // Reset and close
      setIsOpen(false);
      setSearchTerm('');
    } catch (error) {
      console.error('Error assigning student:', error);
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <div ref={containerRef} className="relative mt-2">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 transition-colors"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Student
        </button>
      ) : (
        <div className="bg-white border border-slate-300 rounded-lg shadow-lg p-2 w-64">
          {/* Search Input */}
          <div className="relative mb-2">
            <MagnifyingGlassIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for a student..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Results */}
          {searchTerm.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded">
              {filteredStudents.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {filteredStudents.map((student) => (
                    <li key={student.id}>
                      <button
                        onClick={() => handleAssignStudent(student.id)}
                        disabled={isAssigning}
                        className="w-full px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-between"
                      >
                        <span>{student.name}</span>
                        <span className="text-[10px] text-slate-400">Add</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-2 py-3 text-xs text-slate-500 text-center">
                  No students found
                </div>
              )}
            </div>
          )}

          {searchTerm.length === 0 && (
            <div className="px-2 py-3 text-[10px] text-slate-400 text-center">
              Start typing to search for students
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => {
              setIsOpen(false);
              setSearchTerm('');
            }}
            className="mt-2 w-full px-2 py-1 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
