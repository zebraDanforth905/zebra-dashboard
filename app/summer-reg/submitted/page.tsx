import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import { fetchSubmittedChoices } from '@/app/lib/summer-data';

export const metadata: Metadata = {
  title: 'Submitted | Zebra Robotics',
};

const SUMMER_LABEL: Record<string, string> = {
  enrolling: 'Enrolling in summer sessions',
  pausing:   'Pausing for summer',
  no_change: 'No change — keeping current schedule',
  other:     'Custom request',
};

const FALL_LABEL: Record<string, string> = {
  same:   'Keep current slot',
  change: 'Requesting a different time',
  pause:  'Pausing fall / not sure yet',
};

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const data = token ? await fetchSubmittedChoices(token) : null;

  const greeting = data?.customer_alternate_name
    ? `${data.customer_name.split(' ')[0]} & ${data.customer_alternate_name.split(' ')[0]}`
    : data?.customer_name ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <Image src="/zebra-logo.png" alt="Zebra Robotics" width={180} height={60} />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">You&apos;re all set!</h1>
              {greeting && (
                <p className="text-sm text-slate-500 mt-1">Hi, {greeting} — thanks for submitting.</p>
              )}
            </div>
          </div>

          {/* Per-student summary */}
          {data && data.students.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">What you submitted</p>
              {data.students.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                  <p className="font-medium text-slate-800">{s.student_name}</p>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p>
                      <span className="text-slate-400">Summer: </span>
                      {SUMMER_LABEL[s.summer_status] ?? s.summer_status}
                    </p>
                    {s.session_labels.length > 0 && (
                      <p className="ml-4 text-xs text-slate-500">{s.session_labels.join(', ')}</p>
                    )}
                    {s.custom_notes && (
                      <p className="ml-4 text-xs text-slate-500 italic">{s.custom_notes}</p>
                    )}
                    {s.fall_status && (
                      <p>
                        <span className="text-slate-400">September: </span>
                        {FALL_LABEL[s.fall_status] ?? s.fall_status}
                      </p>
                    )}
                    {s.fall_session_labels.length > 0 && (
                      <p className="ml-4 text-xs text-slate-500">{s.fall_session_labels.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer notes */}
          <div className="text-center space-y-2 pt-2 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Our staff will review your preferences and be in touch if we have any questions.
            </p>
            <p className="text-sm text-slate-500">
              We&apos;ll reach out in August to re-confirm your fall schedule before September begins.
            </p>
            {token && (
              <p className="text-xs text-slate-400 mt-1">
                Need to make a change?{' '}
                <Link href={`/summer-reg?token=${token}`} className="text-sky-600 underline">
                  Go back and resubmit.
                </Link>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
