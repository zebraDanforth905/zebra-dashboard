'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { fetchCustomerNotes } from '@/app/lib/data';
import { createCustomerNote, deleteCustomerNote } from '@/app/lib/actions';
import { CustomerNote } from '@/app/lib/definitions';

type Props = {
  customerId: string;
  customerName: string;
  currentUserName: string;
  onClose: () => void;
};

export default function CustomerNotesModal({ customerId, customerName, currentUserName, onClose }: Props) {
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [customerId]);

  const loadNotes = async () => {
    try {
      const data = await fetchCustomerNotes(customerId);
      setNotes(data);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createCustomerNote(customerId, newNoteContent.trim(), currentUserName);
      setNewNoteContent('');
      await loadNotes();
    } catch (error) {
      alert('Failed to create note');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await deleteCustomerNote(noteId, customerId);
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (error) {
      alert('Failed to delete note');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Customer Notes</h2>
            <p className="text-sm text-gray-600 mt-1">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Create New Note Form */}
        <form onSubmit={handleCreateNote} className="mb-6">
          <label htmlFor="newNote" className="block text-sm font-medium text-gray-700 mb-2">
            Add New Note
          </label>
          <textarea
            id="newNote"
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            placeholder="Enter note content..."
            disabled={isSubmitting}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !newNoteContent.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              {isSubmitting ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </form>

        {/* Notes List */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Note History</h3>
          {loading ? (
            <div className="py-8 text-center text-gray-500">Loading...</div>
          ) : notes.length === 0 ? (
            <div className="py-8 text-center text-gray-500">No notes yet for this customer.</div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          {new Date(note.date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span>•</span>
                        <span>by {note.creator}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      title="Delete note"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t pt-4">
          <button
            onClick={onClose}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
