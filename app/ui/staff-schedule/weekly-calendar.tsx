'use client';

import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ShiftTemplateWithAssignments, Shift } from '@/app/lib/staff-schedule-types';
import { createShiftAssignment, deleteShiftAssignment, updateShiftAssignmentEndDate, createAbsence, updateShift, updateShiftTemplate, deleteShift, deleteShiftTemplate } from '@/app/lib/actions';

type Props = {
  templates: ShiftTemplateWithAssignments[];
  shifts: Shift[];
  staffUsers: Array<{ id: string; name: string; email: string }>;
};

export default function WeeklyCalendar({ templates, shifts: shiftsFromProps, staffUsers }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [addingStaffTo, setAddingStaffTo] = useState<{ type: 'template' | 'shift'; id: string; date: string } | null>(null);
  const [editingShift, setEditingShift] = useState<{ type: 'template' | 'shift'; id: string; data: any } | null>(null);
  const [showAssignmentTypeModal, setShowAssignmentTypeModal] = useState<{
    templateId: string;
    staffUserId: string;
    date: string;
    existingAssignments: Array<{ id: string; staffName: string }>;
  } | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState<{
    assignmentId: string;
    staffName: string;
    date: string;
    isTemplate: boolean;
  } | null>(null);

  const handleAddStaff = async (type: 'template' | 'shift', id: string, staffUserId: string, date: string) => {
    try {
      if (type === 'template') {
        // Check if there are existing assignments for this template on this date
        const template = templates.find(t => t.id === id);
        const parseLocalDate = (dateStr: string | Date) => {
          if (!dateStr) return null;
          const d = typeof dateStr === 'string' ? dateStr : dateStr.toISOString().split('T')[0];
          const [year, month, day] = d.split('T')[0].split('-').map(Number);
          return new Date(year, month - 1, day);
        };
        
        const checkDate = new Date(date);
        const [year, month, day] = date.split('-').map(Number);
        const normalizedCheckDate = new Date(year, month - 1, day);
        
        const existingAssignments = template?.assignments?.filter(a => {
          const fromDate = parseLocalDate(a.effective_from as any);
          const toDate = parseLocalDate(a.effective_to as any);
          return (!fromDate || fromDate <= normalizedCheckDate) && (!toDate || toDate >= normalizedCheckDate);
        }).map(a => ({
          id: a.id,
          staffName: a.staff_name || 'Unknown'
        })) || [];
        
        if (existingAssignments.length > 0) {
          // Show modal to ask how to handle the assignment
          setShowAssignmentTypeModal({
            templateId: id,
            staffUserId,
            date,
            existingAssignments
          });
          setAddingStaffTo(null);
          return;
        }
      }
      
      // For shifts or templates without existing assignment, add directly
      const formData = new FormData();
      if (type === 'template') {
        formData.append('template_id', id);
        formData.append('effective_date', date);
        formData.append('assignment_type', 'add');
      } else {
        formData.append('shift_id', id);
      }
      formData.append('staff_user_id', staffUserId);
      await createShiftAssignment(formData);
      setAddingStaffTo(null);
      window.location.reload();
    } catch (error) {
      console.error('Error adding staff:', error);
    }
  };

  const handleAssignmentTypeChoice = async (
    assignmentType: 'add' | 'replace' | 'substitute',
    replaceAssignmentId?: string
  ) => {
    if (!showAssignmentTypeModal) return;
    
    try {
      const formData = new FormData();
      formData.append('template_id', showAssignmentTypeModal.templateId);
      formData.append('staff_user_id', showAssignmentTypeModal.staffUserId);
      formData.append('effective_date', showAssignmentTypeModal.date);
      formData.append('assignment_type', assignmentType);
      if (replaceAssignmentId) {
        formData.append('replace_assignment_id', replaceAssignmentId);
      }
      
      await createShiftAssignment(formData);
      setShowAssignmentTypeModal(null);
      window.location.reload();
    } catch (error) {
      console.error('Error creating assignment:', error);
    }
  };

  const handleRemoveStaff = async (assignmentId: string) => {
    try {
      const formData = new FormData();
      formData.append('assignment_id', assignmentId);
      await deleteShiftAssignment(formData);
      window.location.reload();
    } catch (error) {
      console.error('Error removing staff:', error);
    }
  };

  const handleRemoveChoice = async (type: 'permanent' | 'oneday') => {
    if (!showRemoveModal) return;
    
    try {
      if (type === 'permanent') {
        // End the assignment the day before the selected date
        const dayBefore = new Date(showRemoveModal.date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayBeforeStr = dayBefore.toISOString().split('T')[0];
        
        const formData = new FormData();
        formData.append('assignment_id', showRemoveModal.assignmentId);
        formData.append('effective_to', dayBeforeStr);
        await updateShiftAssignmentEndDate(formData);
      } else {
        // One-day absence: split the assignment
        const formData = new FormData();
        formData.append('assignment_id', showRemoveModal.assignmentId);
        formData.append('absence_date', showRemoveModal.date);
        await createAbsence(formData);
      }
      
      setShowRemoveModal(null);
      window.location.reload();
    } catch (error) {
      console.error('Error removing staff:', error);
    }
  };

  // Get start of week (Sunday)
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  // Get array of 7 dates for the week
  const getWeekDates = (startDate: Date) => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return date;
    });
  };

  const weekStart = getWeekStart(selectedDate);
  const weekDates = getWeekDates(weekStart);

  const goToPreviousWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getShiftsForDay = (date: Date, weekday: number) => {
    const dayShifts: Array<{
      name: string;
      time: string;
      assignments: Array<{
        id: string;
        staffName: string;
        role: string | null;
      }>;
      type: 'template' | 'special';
      eventType?: string;
      templateId?: string;
      shiftId?: string;
    }> = [];

    // Add template shifts for this weekday
    const dayTemplates = templates.filter(t => t.weekday === weekday);
    dayTemplates.forEach(template => {
      // Normalize the check date to local date (ignore timezone)
      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      // Helper to parse date string as local date
      const parseLocalDate = (dateStr: string | Date) => {
        if (!dateStr) return null;
        const d = typeof dateStr === 'string' ? dateStr : dateStr.toISOString().split('T')[0];
        const [year, month, day] = d.split('T')[0].split('-').map(Number);
        return new Date(year, month - 1, day);
      };
      
      // Filter assignments that cover this date
      const matchingAssignments = template.assignments.filter(a => {
        const fromDate = parseLocalDate(a.effective_from as any);
        const toDate = parseLocalDate(a.effective_to as any);
        
        return (!fromDate || fromDate <= checkDate) && (!toDate || toDate >= checkDate);
      });
      
      const validAssignments = matchingAssignments.map(a => ({
          id: a.id,
          staffName: a.staff_name || 'Unknown',
          role: a.role
        }));

      dayShifts.push({
        name: template.name,
        time: `${formatTime(template.start_time)} - ${formatTime(template.end_time)}`,
        assignments: validAssignments,
        type: 'template',
        templateId: template.id
      });
    });

    // Add special shifts for this specific date
    const dateStr = date.toISOString().split('T')[0];
    shiftsFromProps.forEach(shift => {
      const shiftDate = new Date(shift.starts_at).toISOString().split('T')[0];
      if (shiftDate === dateStr) {
        const startTime = new Date(shift.starts_at).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        const endTime = new Date(shift.ends_at).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        
        const shiftAssignments = (shift.assignments || []).map(a => ({
          id: a.id,
          staffName: a.staff_name || 'Unknown',
          role: a.role
        }));
        
        dayShifts.push({
          name: shift.name,
          time: `${startTime} - ${endTime}`,
          assignments: shiftAssignments,
          type: 'special',
          eventType: shift.event_type,
          shiftId: shift.id
        });
      }
    });

    return dayShifts;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-4">
      {/* Edit Modal */}
      {editingShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Edit {editingShift.type === 'template' ? 'Template' : 'Shift'}
            </h3>
            
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                
                try {
                  if (editingShift.type === 'template') {
                    formData.append('template_id', editingShift.id);
                    await updateShiftTemplate(formData);
                  } else {
                    formData.append('shift_id', editingShift.id);
                    await updateShift(formData);
                  }
                  setEditingShift(null);
                  window.location.reload();
                } catch (error) {
                  console.error('Error updating shift:', error);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingShift.data?.name}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {editingShift.type === 'template' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Weekday
                    </label>
                    <select
                      name="weekday"
                      defaultValue={editingShift.data?.weekday}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      name="start_time"
                      defaultValue={editingShift.data?.start_time}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      name="end_time"
                      defaultValue={editingShift.data?.end_time}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="starts_at"
                      defaultValue={editingShift.data?.starts_at ? new Date(editingShift.data.starts_at).toISOString().slice(0, 16) : ''}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      name="ends_at"
                      defaultValue={editingShift.data?.ends_at ? new Date(editingShift.data.ends_at).toISOString().slice(0, 16) : ''}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      name="notes"
                      defaultValue={editingShift.data?.notes || ''}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment Type Choice Modal */}
      {showAssignmentTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">
              How would you like to assign this staff member?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Currently assigned: {showAssignmentTypeModal.existingAssignments.map(a => a.staffName).join(', ')}
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleAssignmentTypeChoice('add')}
                className="w-full text-left p-4 border-2 border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <div className="font-semibold text-slate-900 mb-1">
                  Add as Additional Staff
                </div>
                <div className="text-sm text-slate-600">
                  Add this person to work alongside the currently assigned staff from this date forward.
                </div>
              </button>
              
              {showAssignmentTypeModal.existingAssignments.map((assignment) => (
                <div key={assignment.id} className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">
                    Replace {assignment.staffName}:
                  </div>
                  <div className="pl-4 space-y-2">
                    <button
                      onClick={() => handleAssignmentTypeChoice('replace', assignment.id)}
                      className="w-full text-left p-3 border-2 border-slate-300 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition"
                    >
                      <div className="font-semibold text-slate-900 mb-1 text-sm">
                        Permanent Replacement
                      </div>
                      <div className="text-xs text-slate-600">
                        Replace {assignment.staffName} permanently from this date forward.
                      </div>
                    </button>
                    
                    <button
                      onClick={() => handleAssignmentTypeChoice('substitute', assignment.id)}
                      className="w-full text-left p-3 border-2 border-slate-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition"
                    >
                      <div className="font-semibold text-slate-900 mb-1 text-sm">
                        One-Day Substitute
                      </div>
                      <div className="text-xs text-slate-600">
                        Replace {assignment.staffName} for this day only. They'll continue before and after.
                      </div>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowAssignmentTypeModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Staff Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">
              Remove {showRemoveModal.staffName}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              How would you like to remove this staff member?
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleRemoveChoice('permanent')}
                className="w-full text-left p-4 border-2 border-slate-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition"
              >
                <div className="font-semibold text-slate-900 mb-1">
                  Remove from This Date Forward
                </div>
                <div className="text-sm text-slate-600">
                  End their assignment permanently starting from this date. They will no longer be assigned to this shift.
                </div>
              </button>
              
              <button
                onClick={() => handleRemoveChoice('oneday')}
                className="w-full text-left p-4 border-2 border-slate-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition"
              >
                <div className="font-semibold text-slate-900 mb-1">
                  Absent for This Day Only
                </div>
                <div className="text-sm text-slate-600">
                  Mark them as absent for this date only. They will continue to be assigned before and after this date.
                </div>
              </button>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowRemoveModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
        <button
          onClick={goToPreviousWeek}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          <ChevronLeftIcon className="h-5 w-5 text-slate-600" />
        </button>

        <div className="flex items-center gap-4">
          <div className="text-lg font-semibold text-slate-900">
            {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 transition"
          >
            Today
          </button>
        </div>

        <button
          onClick={goToNextWeek}
          className="p-2 hover:bg-slate-100 rounded-lg transition"
        >
          <ChevronRightIcon className="h-5 w-5 text-slate-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, index) => {
          const shifts = getShiftsForDay(date, index);
          const todayClass = isToday(date) ? 'ring-2 ring-sky-500' : '';

          return (
            <div
              key={index}
              className={`bg-white rounded-lg shadow p-3 min-h-[300px] ${todayClass}`}
            >
              {/* Day Header */}
              <div className="border-b border-slate-200 pb-2 mb-3">
                <div className="text-xs font-medium text-slate-500 uppercase">
                  {dayNames[index]}
                </div>
                <div className={`text-lg font-semibold ${isToday(date) ? 'text-sky-600' : 'text-slate-900'}`}>
                  {date.getDate()}
                </div>
              </div>

              {/* Shifts */}
              <div className="space-y-2">
                {shifts.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No shifts</div>
                ) : (
                  shifts.map((shift, shiftIndex) => (
                    <div
                      key={shiftIndex}
                      className={`text-xs rounded p-2 ${
                        shift.type === 'special'
                          ? shift.eventType === 'birthday'
                            ? 'bg-pink-50 border border-pink-200'
                            : shift.eventType === 'workshop'
                            ? 'bg-purple-50 border border-purple-200'
                            : 'bg-amber-50 border border-amber-200'
                          : 'bg-sky-50 border border-sky-200'
                      }`}
                    >
                      {/* Shift Header with Edit/Delete Icons */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-slate-900 flex-1">
                          {shift.name}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (shift.type === 'template') {
                                const templateData = templates.find(t => t.id === shift.templateId);
                                setEditingShift({
                                  type: 'template',
                                  id: shift.templateId!,
                                  data: templateData
                                });
                              } else {
                                const shiftData = shiftsFromProps.find(s => s.id === shift.shiftId);
                                setEditingShift({
                                  type: 'shift',
                                  id: shift.shiftId!,
                                  data: shiftData
                                });
                              }
                            }}
                            className="p-0.5 hover:bg-white/50 rounded transition"
                            title="Edit shift"
                          >
                            <PencilIcon className="h-3 w-3 text-slate-500" />
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm(`Delete "${shift.name}"?`)) {
                                try {
                                  const formData = new FormData();
                                  if (shift.type === 'template') {
                                    formData.append('template_id', shift.templateId!);
                                    await deleteShiftTemplate(formData);
                                  } else {
                                    formData.append('shift_id', shift.shiftId!);
                                    await deleteShift(formData);
                                  }
                                  window.location.reload();
                                } catch (error) {
                                  console.error('Error deleting shift:', error);
                                }
                              }
                            }}
                            className="p-0.5 hover:bg-white/50 rounded transition"
                            title="Delete shift"
                          >
                            <TrashIcon className="h-3 w-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-slate-600 mb-1">
                        {shift.time}
                      </div>
                      
                      {/* Staff Assignments */}
                      <div className="text-slate-700 space-y-1">
                        {shift.assignments.map((assignment) => (
                          <div key={assignment.id} className="flex items-center justify-between gap-1">
                            <div className="text-xs px-1 py-0.5 flex-1">
                              👤 {assignment.staffName}
                              {assignment.role && ` (${assignment.role})`}
                            </div>
                            <button
                              onClick={() => {
                                if (shift.type === 'template') {
                                  setShowRemoveModal({
                                    assignmentId: assignment.id,
                                    staffName: assignment.staffName,
                                    date: date.toISOString().split('T')[0],
                                    isTemplate: true
                                  });
                                } else {
                                  if (window.confirm(`Remove ${assignment.staffName} from this shift?`)) {
                                    handleRemoveStaff(assignment.id);
                                  }
                                }
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 transition"
                              title="Remove staff"
                            >
                              <TrashIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        
                        {/* Add Staff Button */}
                        {addingStaffTo?.type === shift.type && 
                         addingStaffTo?.id === (shift.templateId || shift.shiftId) &&
                         addingStaffTo?.date === date.toISOString().split('T')[0] ? (
                          <select
                            autoFocus
                            className="text-xs px-1 py-0.5 border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500 w-full"
                            value=""
                            onChange={(e) => {
                              if (e.target.value && (shift.templateId || shift.shiftId)) {
                                handleAddStaff(
                                  shift.type === 'template' ? 'template' : 'shift',
                                  (shift.templateId || shift.shiftId)!,
                                  e.target.value,
                                  date.toISOString().split('T')[0]
                                );
                              }
                            }}
                            onBlur={() => setAddingStaffTo(null)}
                          >
                            <option value="">Select staff to add...</option>
                            {staffUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setAddingStaffTo({ 
                              type: shift.type === 'template' ? 'template' : 'shift', 
                              id: (shift.templateId || shift.shiftId)!,
                              date: date.toISOString().split('T')[0]
                            })}
                            className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-1 py-0.5 rounded transition"
                          >
                            + Add Staff
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
