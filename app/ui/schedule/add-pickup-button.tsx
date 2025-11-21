'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { addPickup } from '@/app/lib/actions';
import { fetchStudentsForAssignment } from '@/app/lib/data';

export default function AddPickupButton({ defaultWeekday }: { defaultWeekday?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [weekday, setWeekday] = useState(defaultWeekday?.toLowerCase() || '');
  const [waiverSigned, setWaiverSigned] = useState(false);
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
      if (!studentId) {
        setError('Please select a student');
        setIsSubmitting(false);
        return;
      }
      if (!schoolName) {
        setError('Please select a school');
        setIsSubmitting(false);
        return;
      }
      if (!weekday) {
        setError('Please select a day');
        setIsSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.append('studentId', studentId);
      formData.append('school_name', schoolName);
      formData.append('teacher_name', teacherName);
      formData.append('room_number', roomNumber);
      formData.append('weekday', weekday);
      formData.append('waiver_signed', waiverSigned ? 'on' : '');

      await addPickup(formData);

      // Reset form and close modal
      handleClose();
      window.location.reload();
    } catch (err) {
      setError('Failed to add pickup. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStudentId('');
    setStudentQuery('');
    setSchoolName('');
    setTeacherName('');
    setRoomNumber('');
    setWeekday(defaultWeekday?.toLowerCase() || '');
    setWaiverSigned(false);
    setError('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      >
        <PlusIcon className="h-5 w-5" />
        Add Pickup
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Add Pickup</h2>
              <button
                onClick={handleClose}
                className="rounded-full p-1 hover:bg-gray-100"
                disabled={isSubmitting}
              >
                <XMarkIcon className="h-6 w-6 text-gray-500" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Student Search */}
              <div>
                <label htmlFor="studentSearch" className="block text-sm font-medium text-gray-700 mb-1">
                  Student <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="studentSearch"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
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

              {/* School Selection */}
              <div>
                <label htmlFor="school_name" className="block text-sm font-medium text-gray-700 mb-1">
                  School <span className="text-red-600">*</span>
                </label>
                <select
                  id="school_name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={isSubmitting}
                  required
                >
                  <option value="">Select School</option>
                  <option value="frankland">Frankland</option>
                  <option value="jackman">Jackman</option>
                </select>
              </div>

              {/* Teacher Name */}
              <div>
                <label htmlFor="teacher_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Teacher Name
                </label>
                <input
                  type="text"
                  id="teacher_name"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Teacher Name"
                  disabled={isSubmitting}
                />
              </div>

              {/* Room Number */}
              <div>
                <label htmlFor="room_number" className="block text-sm font-medium text-gray-700 mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  id="room_number"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Room Number"
                  disabled={isSubmitting}
                />
              </div>

              {/* Weekday Selection */}
              <div>
                <label htmlFor="weekday" className="block text-sm font-medium text-gray-700 mb-1">
                  Day <span className="text-red-600">*</span>
                </label>
                <select
                  id="weekday"
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={isSubmitting}
                  required
                >
                  <option value="">Select Day</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                </select>
              </div>

              {/* Waiver Signed */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={waiverSigned}
                    onChange={(e) => setWaiverSigned(e.target.checked)}
                    className="mr-2 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm font-medium text-gray-700">Waiver Signed</span>
                </label>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Adding...' : 'Add Pickup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
