import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';
import { fetchSubmittedChoices } from '@/app/lib/summer-data';

export const metadata: Metadata = {
  title: 'Submitted | Zebra Robotics',
};

const SUMMER_LABEL: Record<string, string> = {
  enrolling: 'Continuing weekly classes in July and August',
  pausing:   'Not attending this summer in July and August',
  no_change: 'No change — keeping current schedule',
  other:     'Custom plan',
};

const FALL_LABEL: Record<string, string> = {
  same:   'Keep current session',
  change: 'Requesting a different class time starting in September',
  pause:  'Not sure yet — we won\'t hold a September spot',
};

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const data = token ? await fetchSubmittedChoices(token) : null;

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
              <p className="text-sm text-slate-500 mt-1">Hi Zebra family — thanks for submitting.</p>
            </div>
          </div>

          {/* Per-student summary */}
          {data && data.students.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">What you submitted</p>
              {data.students.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-3">
                  <p className="font-semibold text-slate-800 text-base">{s.student_name}</p>

                  {/* Summer block */}
                  <div className="rounded-lg bg-sky-50 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Summer</p>
                    <p className="text-sm text-slate-700 font-medium">
                      {SUMMER_LABEL[s.summer_status] ?? s.summer_status}
                    </p>
                    {s.session_labels.length > 0 && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">Sessions: </span>
                        {s.session_labels.join(', ')}
                      </p>
                    )}
                    {s.custom_notes && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">Note: </span>
                        <span className="italic">{s.custom_notes}</span>
                      </p>
                    )}
                  </div>

                  {/* Fall block */}
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">September (Fall)</p>
                    <p className="text-sm text-slate-700 font-medium">
                      {s.fall_status ? (FALL_LABEL[s.fall_status] ?? s.fall_status) : '—'}
                    </p>
                    {s.fall_session_labels.length > 0 && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">Requested times: </span>
                        {s.fall_session_labels.join(', ')}
                      </p>
                    )}
                    {s.fall_notes && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">Note: </span>
                        <span className="italic">{s.fall_notes}</span>
                      </p>
                    )}
                    {s.pickup_requested && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400">School pickup: </span>
                        {s.pickup_school === 'other'
                          ? (s.pickup_school_other ?? 'Other school')
                          : (s.pickup_school ?? 'Requested')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer notes */}
          <div className="text-center space-y-2 pt-2 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Our team will review your preferences and be in touch if we have any questions.
            </p>
            <p className="text-sm text-slate-500">
              We&apos;ll reach out in August to re-confirm your fall schedule before classes begin in September.
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
