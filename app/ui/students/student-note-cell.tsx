'use client';

import { useState } from 'react';
import { StudentTableData } from '@/app/lib/definitions';
import StudentNotesModal from './student-notes-modal';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';

type Props = {
  student: StudentTableData;
  currentUserName: string;
};

export default function StudentNoteCell({ student, currentUserName }: Props) {
  const [showModal, setShowModal] = useState(false);

  const truncateNote = (content: string, maxLength: number = 50) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <>
      {!student.recent_note ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowModal(true);
          }}
          className="text-gray-400 hover:text-gray-600 text-xs italic"
        >
          Add note...
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowModal(true);
          }}
          className="text-left hover:bg-blue-50 rounded p-1 -m-1 transition-colors group w-full"
        >
          <div className="flex items-start gap-2">
            <ChatBubbleLeftIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 truncate">{truncateNote(student.recent_note.content)}</p>
              <p className="text-xs text-gray-500">
                {new Date(student.recent_note.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })} - {student.recent_note.creator}
              </p>
            </div>
          </div>
        </button>
      )}

      {showModal && (
        <StudentNotesModal
          studentId={student.id}
          studentName={student.name}
          currentUserName={currentUserName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
