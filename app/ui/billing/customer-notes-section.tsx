'use client';

import { useState } from 'react';
import { CustomerNote } from '@/app/lib/definitions';
import CustomerNotesModal from './customer-notes-modal';
import { ChatBubbleLeftIcon, PlusIcon } from '@heroicons/react/24/outline';

type Props = {
  customerId: string;
  customerName: string;
  notes: CustomerNote[];
  currentUserName: string;
};

export default function CustomerNotesSection({ customerId, customerName, notes, currentUserName }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium text-slate-700">Notes:</h2>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Add Note
          </button>
        </div>

        {notes.length === 0 ? (
          <div className="text-sm text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
            No notes yet for this customer.
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {notes.slice(0, 3).map((note) => (
              <div
                key={note.id}
                className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 cursor-pointer"
                onClick={() => setShowModal(true)}
              >
                <div className="flex items-start gap-2">
                  <ChatBubbleLeftIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 line-clamp-2">{note.content}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>
                        {new Date(note.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      <span>•</span>
                      <span>{note.creator}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {notes.length > 3 && (
              <button
                onClick={() => setShowModal(true)}
                className="w-full text-center text-xs text-blue-600 hover:text-blue-700 font-medium py-2"
              >
                View all {notes.length} notes →
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <CustomerNotesModal
          customerId={customerId}
          customerName={customerName}
          currentUserName={currentUserName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
