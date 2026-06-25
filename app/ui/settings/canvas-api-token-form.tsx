'use client';

import { useState } from 'react';
import { saveCanvasApiToken } from '@/app/lib/actions';

type CanvasTokenSource = 'environment' | 'database' | 'none';

type Props = {
  configured: boolean;
  source: CanvasTokenSource;
  maskedToken: string | null;
  settingsError: string | null;
};

export default function CanvasApiTokenForm({
  configured,
  source,
  maskedToken,
  settingsError,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceLabel =
    source === 'environment'
      ? 'Environment variable'
      : source === 'database'
        ? 'Database setting (via dashboard)'
        : 'Not configured';

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await saveCanvasApiToken(formData);
    if (result.ok) {
      setSuccess(result.message || 'Canvas API token updated');
    } else {
      setError(result.error || 'Failed to update Canvas API token');
    }

    setIsSubmitting(false);
  }

  return (
    <div>
      {settingsError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {settingsError}
        </div>
      )}

      {!settingsError && (
        <>
          <p className="text-sm text-gray-700 mb-4">
            Canvas token source: <strong>{sourceLabel}</strong>
          </p>

          {configured && maskedToken && source === 'database' && (
            <p className="text-sm text-gray-600 mb-4">
              Stored token: <span className="font-mono">{maskedToken}</span>
            </p>
          )}

          {configured && source === 'environment' && (
            <p className="text-sm text-gray-600 mb-4">
              Stored environment token: <span className="font-mono">{maskedToken}</span>
            </p>
          )}
        </>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="canvasApiToken" className="block text-sm font-medium text-gray-700 mb-1">
            Canvas API Token
          </label>
          <input
            type="password"
            id="canvasApiToken"
            name="canvasApiToken"
            placeholder="Paste a token to store in app settings"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave blank and save to clear the dashboard-stored token.
          </p>
          {source === 'environment' && (
            <p className="mt-1 text-xs text-amber-700">
              Environment token is active and will override the dashboard setting.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save Token'}
          </button>
          <button
            type="submit"
            name="intent"
            value="clear"
            disabled={isSubmitting}
            className="bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors"
          >
            Clear Saved Token
          </button>
        </div>
      </form>
    </div>
  );
}
