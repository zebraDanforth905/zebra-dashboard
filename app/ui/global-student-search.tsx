'use client';

import { useState, useEffect, useRef } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useDebouncedCallback } from 'use-debounce';

type StudentSearchResult = {
  id: string;
  name: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  enrollments: Array<{
    id: string;
    course_name: string;
    weekday: string;
    start_time: string;
    end_time: string;
    session_id: string;
  }>;
  last_absence: {
    date: Date;
    course_name: string;
  } | null;
  upcoming_absence: {
    date: Date;
    course_name: string;
  } | null;
  last_makeup: {
    date: Date;
    course_name: string;
    weekday: string;
    start_time: string;
  } | null;
  upcoming_makeup: {
    date: Date;
    course_name: string;
    weekday: string;
    start_time: string;
  } | null;
  notes: Array<{
    id: string;
    content: string;
    date: Date;
    creator: string;
  }>;
};

export default function GlobalStudentSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchStudents = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/search-students?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setResults(data.students || []);
      setIsOpen(true);
    } catch (error) {
      console.error('Error searching students:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  useEffect(() => {
    searchStudents(query);
  }, [query, searchStudents]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={dropdownRef} className="relative w-full max-w-md">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search students..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setIsOpen(true)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (query.trim() || results.length > 0) && (
        <div className="absolute z-50 mt-2 w-full max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Searching...
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {results.map((student) => (
                <div key={student.id} className="p-4 hover:bg-gray-50">
                  {/* Student Name & Parent Info */}
                  <div className="mb-3">
                    <Link
                      href={`/dashboard/students/${student.id}/edit`}
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800"
                      onClick={() => setIsOpen(false)}
                    >
                      {student.name}
                    </Link>
                    {student.customer_name && (
                      <div className="mt-1 text-sm text-gray-600">
                        Parent:{' '}
                        <Link
                          href={`/dashboard/billing/${student.customer_id}`}
                          className="text-blue-600 hover:underline"
                          onClick={() => setIsOpen(false)}
                        >
                          {student.customer_name}
                        </Link>
                        {student.customer_email && (
                          <span className="ml-2 text-gray-500">({student.customer_email})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Enrollments */}
                  {student.enrollments && student.enrollments.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold uppercase text-gray-500 mb-1">
                        Enrollments
                      </div>
                      <div className="space-y-1">
                        {student.enrollments.map((enrollment) => (
                          <Link
                            key={enrollment.id}
                            href={`/dashboard/schedule/${enrollment.weekday.toLowerCase()}`}
                            className="block text-sm text-gray-700 hover:text-blue-600"
                            onClick={() => setIsOpen(false)}
                          >
                            <span className="font-medium">{enrollment.course_name}</span>
                            {' - '}
                            <span className="text-gray-600">
                              {enrollment.weekday} {enrollment.start_time} - {enrollment.end_time}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Absences & Makeups */}
                  <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                    {/* Absences */}
                    <div>
                      <div className="font-semibold uppercase text-gray-500 mb-1">Absences</div>
                      {student.upcoming_absence && (
                        <div className="text-orange-600">
                          <span className="font-medium">Upcoming:</span>{' '}
                          {formatDate(student.upcoming_absence.date)}
                          <div className="text-gray-600">{student.upcoming_absence.course_name}</div>
                        </div>
                      )}
                      {student.last_absence && (
                        <div className="text-gray-600 mt-1">
                          <span className="font-medium">Last:</span>{' '}
                          {formatDate(student.last_absence.date)}
                          <div className="text-gray-500">{student.last_absence.course_name}</div>
                        </div>
                      )}
                      {!student.upcoming_absence && !student.last_absence && (
                        <div className="text-gray-400">None</div>
                      )}
                    </div>

                    {/* Makeups */}
                    <div>
                      <div className="font-semibold uppercase text-gray-500 mb-1">Makeups</div>
                      {student.upcoming_makeup && (
                        <div className="text-green-600">
                          <span className="font-medium">Upcoming:</span>{' '}
                          {formatDate(student.upcoming_makeup.date)}
                          <div className="text-gray-600">
                            {student.upcoming_makeup.course_name}
                          </div>
                          <div className="text-gray-500">
                            {student.upcoming_makeup.weekday} {student.upcoming_makeup.start_time}
                          </div>
                        </div>
                      )}
                      {student.last_makeup && (
                        <div className="text-gray-600 mt-1">
                          <span className="font-medium">Last:</span>{' '}
                          {formatDate(student.last_makeup.date)}
                          <div className="text-gray-500">{student.last_makeup.course_name}</div>
                        </div>
                      )}
                      {!student.upcoming_makeup && !student.last_makeup && (
                        <div className="text-gray-400">None</div>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {student.notes && student.notes.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
                        Recent Notes ({student.notes.length})
                      </div>
                      <div className="space-y-2">
                        {student.notes.slice(0, 2).map((note) => (
                          <div key={note.id} className="text-xs">
                            <div className="text-gray-700 line-clamp-2">{note.content}</div>
                            <div className="text-gray-400 mt-1">
                              {formatDate(note.date)} by {note.creator}
                            </div>
                          </div>
                        ))}
                        {student.notes.length > 2 && (
                          <div className="text-xs text-gray-400">
                            + {student.notes.length - 2} more note(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No students found matching &quot;{query}&quot;
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
