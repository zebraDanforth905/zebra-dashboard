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

  const truncateNote = (content: string, maxLength: number = 80) => {
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
          className="text-gray-400 hover:bg-gray-50 text-xs italic px-4 py-2 block w-full text-left"
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
          className="text-left hover:bg-blue-50 px-4 py-2 transition-colors block w-full"
        >
          <div className="flex items-start gap-2">
            <ChatBubbleLeftIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 break-words">{truncateNote(student.recent_note.content)}</p>
              <p className="text-xs text-gray-500 break-words">
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
