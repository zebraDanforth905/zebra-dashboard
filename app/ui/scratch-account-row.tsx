'use client';

import { fetchStudentsForAssignment } from '@/app/lib/data';
import {
  assignStudentToScratchAccount,
  assignStudentToRobloxAccount,
  assignStudentToLaptop,
  unassignStudentFromLaptop,
} from '@/app/lib/actions';
import { useEffect, useState } from 'react';

export default function ScratchAccountRow({ account }: { account: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleAssignStudent = async (studentId: string) => {
    setIsUpdating(true);
    try {
      if (account.account_type === 'scratch') {
        await assignStudentToScratchAccount(account.username, studentId);
      } else if (account.account_type === 'roblox') {
        await assignStudentToRobloxAccount(account.username, studentId);
      } else if (account.account_type === 'laptop') {
        await assignStudentToLaptop(account.username, studentId);
      }
      setIsEditing(false);
      setStudentQuery('');
      setShowDropdown(false);
      setIsUpdating(false);
      window.location.reload();
    } catch (error) {
      console.error('Error assigning student:', error);
      setIsUpdating(false);
    }
  };

  const handleUnassign = async () => {
    setIsUpdating(true);
    try {
      if (account.account_type === 'scratch') {
        await assignStudentToScratchAccount(account.username, null);
      } else if (account.account_type === 'roblox') {
        await assignStudentToRobloxAccount(account.username, null);
      } else if (account.account_type === 'laptop' && account.student_id) {
        await unassignStudentFromLaptop(account.username, account.student_id);
      }
      setIsEditing(false);
      setIsUpdating(false);
      window.location.reload();
    } catch (error) {
      console.error('Error unassigning student:', error);
      setIsUpdating(false);
    }
  };

  const getAccountTypeLabel = () => {
    switch (account.account_type) {
      case 'scratch': return 'Scratch';
      case 'roblox': return 'Roblox';
      case 'laptop': return 'Laptop';
      default: return account.account_type;
    }
  };

  const getAccountTypeBadgeColor = () => {
    switch (account.account_type) {
      case 'scratch': return 'bg-orange-100 text-orange-800';
      case 'roblox': return 'bg-red-100 text-red-800';
      case 'laptop': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAccountTypeBadgeColor()}`}>
          {getAccountTypeLabel()}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {account.username}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {account.password || <span className="text-gray-400 italic">N/A</span>}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {account.student_name || (
          <span className="text-gray-400 italic">Unassigned</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-900"
            disabled={isUpdating}
          >
            {account.account_type === 'laptop' ? 'Assign another' : account.student_id ? 'Change' : 'Assign'}
          </button>
        ) : (
          <div className="flex flex-col gap-2 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="Search students..."
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                disabled={isUpdating}
              />
              {showDropdown && students.length > 0 && (
                <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto flex flex-col">
                  {students.map((student: any) => (
                    <button
                      key={student.id}
                      onClick={() => handleAssignStudent(student.id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm block"
                      disabled={isUpdating}
                    >
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-gray-500">{student.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {account.student_id && (
                <button
                  onClick={handleUnassign}
                  className="text-red-600 hover:text-red-900"
                  disabled={isUpdating}
                >
                  Unassign
                </button>
              )}
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStudentQuery('');
                  setShowDropdown(false);
                }}
                className="text-gray-600 hover:text-gray-900"
                disabled={isUpdating}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
