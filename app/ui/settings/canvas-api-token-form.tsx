'use client';

import { useState } from 'react';
import { saveCanvasApiToken } from '@/app/lib/actions';

type CanvasTokenSource = 'environment' | 'database' | 'none';
type CanvasDashboardTokenStatus = 'valid' | 'invalid' | 'unchecked' | null;

type Props = {
  configured: boolean;
  source: CanvasTokenSource;
  maskedToken: string | null;
  dashboardMaskedToken: string | null;
  dashboardTokenStatus: CanvasDashboardTokenStatus;
  dashboardTokenStatusMessage: string | null;
  settingsError: string | null;
};

export default function CanvasApiTokenForm({
  configured,
  source,
  maskedToken,
  dashboardMaskedToken,
  dashboardTokenStatus,
  dashboardTokenStatusMessage,
  settingsError,
}: Props) {
  const [currentConfigured, setCurrentConfigured] = useState(configured);
  const [currentSource, setCurrentSource] = useState(source);
  const [currentMaskedToken, setCurrentMaskedToken] = useState(maskedToken);
  const [currentDashboardMaskedToken, setCurrentDashboardMaskedToken] = useState(dashboardMaskedToken);
  const [currentDashboardTokenStatus, setCurrentDashboardTokenStatus] = useState(dashboardTokenStatus);
  const [currentDashboardTokenStatusMessage, setCurrentDashboardTokenStatusMessage] = useState(dashboardTokenStatusMessage);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceLabel =
    currentSource === 'environment'
      ? 'Environment variable'
      : currentSource === 'database'
        ? 'Database setting (via dashboard)'
        : 'Not configured';

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await saveCanvasApiToken(formData);
    if (result.ok) {
      if (result.settings) {
        setCurrentConfigured(result.settings.configured);
        setCurrentSource(result.settings.source);
        setCurrentMaskedToken(result.settings.maskedToken);
        setCurrentDashboardMaskedToken(result.settings.dashboardMaskedToken);
        setCurrentDashboardTokenStatus(result.settings.dashboardTokenStatus);
        setCurrentDashboardTokenStatusMessage(result.settings.dashboardTokenStatusMessage);
      }
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

          {currentDashboardMaskedToken && (
            <div className="mb-4 text-sm text-gray-600">
              <p className="flex flex-wrap items-center gap-2">
                <span>
                  Stored dashboard token{currentSource === 'database' ? ' (active)' : ''}:{' '}
                  <span className="font-mono">{currentDashboardMaskedToken}</span>
                </span>
                {currentDashboardTokenStatus && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      currentDashboardTokenStatus === 'valid'
                        ? 'bg-green-100 text-green-800'
                        : currentDashboardTokenStatus === 'invalid'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Status: {currentDashboardTokenStatus}
                  </span>
                )}
              </p>
              {currentDashboardTokenStatus === 'invalid' && currentDashboardTokenStatusMessage && (
                <p className="mt-1 text-xs text-red-700">{currentDashboardTokenStatusMessage}</p>
              )}
            </div>
          )}

          {currentConfigured && currentMaskedToken && currentSource === 'environment' && (
            <p className="text-sm text-gray-600 mb-4">
              Stored environment token (active): <span className="font-mono">{currentMaskedToken}</span>
            </p>
          )}

          <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-medium">Canvas (LMS) API token setup</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open Canvas LMS.</li>
              <li>Go to Account &gt; Settings &gt; New Access Token.</li>
              <li>Create the token, copy it, and paste that token here.</li>
            </ol>
          </div>
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
            placeholder="Paste the Canvas access token here"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isSubmitting}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave blank and save to clear the dashboard-stored token.
          </p>
          {currentSource === 'environment' && (
            <p className="mt-1 text-xs text-amber-700">
              Environment token is active because no dashboard token is saved.
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
