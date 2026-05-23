'use client';

import { useState } from 'react';
import { updateCustomer } from '@/app/lib/actions';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

type Props = {
  customerId: string;
  initialName: string;
  initialEmail: string;
  initialAlternateName: string;
  initialAlternateEmail: string;
};

export default function EditCustomerName({
  customerId,
  initialName,
  initialEmail,
  initialAlternateName,
  initialAlternateEmail,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [alternateName, setAlternateName] = useState(initialAlternateName);
  const [alternateEmail, setAlternateEmail] = useState(initialAlternateEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateCustomer(customerId, name, email, alternateName, alternateEmail);
      setIsEditing(false);
    } catch (err) {
      setError('Failed to update customer');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(initialName);
    setEmail(initialEmail);
    setAlternateName(initialAlternateName);
    setAlternateEmail(initialAlternateEmail);
    setError(null);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold text-slate-800">
          {name}
          {(alternateName || alternateEmail) && (
            <span className="block text-sm font-normal text-slate-500 mt-1">
              Alt: {[alternateName, alternateEmail].filter(Boolean).join(' • ')}
            </span>
          )}
        </h1>
        <button
          onClick={() => setIsEditing(true)}
          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Edit customer name"
        >
          <PencilIcon className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="space-y-2">
        <div>
          <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="customerName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Customer name"
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="customerEmail" className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            id="customerEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="customer@example.com"
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="customerAlternateName" className="block text-sm font-medium text-slate-700 mb-1">
            Alternate Name
          </label>
          <input
            id="customerAlternateName"
            type="text"
            value={alternateName}
            onChange={(e) => setAlternateName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Alternate parent name"
            disabled={saving}
          />
        </div>

        <div>
          <label htmlFor="customerAlternateEmail" className="block text-sm font-medium text-slate-700 mb-1">
            Alternate Email
          </label>
          <input
            id="customerAlternateEmail"
            type="email"
            value={alternateEmail}
            onChange={(e) => setAlternateEmail(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="alternate@example.com"
            disabled={saving}
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckIcon className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <XMarkIcon className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
