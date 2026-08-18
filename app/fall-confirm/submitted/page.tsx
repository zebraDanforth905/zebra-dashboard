import { fetchFallFormData } from '@/app/lib/fall-data';
import Image from 'next/image';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fall Plans Submitted | Zebra Robotics',
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  not_returning: "Paused",
  paused: "Still deciding — we'll keep in touch",
};

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    .format(new Date(`${date}T00:00:00`));
}

export default async function FallSubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const data = token ? await fetchFallFormData(token) : null;
  const answered = data?.students.filter(s => s.latest_status) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 px-6 py-5">
        <div className="mx-auto max-w-3xl">
          <Image src="/zebra-logo.png" alt="Zebra Robotics" width={180} height={60} />
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Thank you!</h1>
          <p className="text-slate-600 mt-2">
            We&apos;ve recorded your fall plans. You&apos;ll hear from us if anything needs follow-up.
          </p>
        </div>

        {answered.length > 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <h2 className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
              What you told us
            </h2>
            <ul className="divide-y divide-slate-100">
              {answered.map(student => (
                <li key={student.student_id} className="px-5 py-4">
                  <p className="font-medium text-slate-800">{student.student_name}</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {STATUS_LABEL[student.latest_status ?? ''] ?? student.latest_status}
                    {student.latest_status === 'confirmed' && student.prefill_slots.length > 0 && (
                      <>
                        {' · '}
                        {student.prefill_slots
                          .map(slot => `${slot.weekday} at ${formatTime(slot.start_time)}`)
                          .join(', ')}
                        {student.prefill_pickup_school
                          ? ` · Pickup from ${student.prefill_pickup_school}`
                          : ' · No pickup'}
                      </>
                    )}
                  </p>
                  {student.latest_status === 'confirmed' && student.prefill_start_date && (
                    <p className="text-sm text-slate-500 mt-0.5">
                      Starting {formatDate(student.prefill_start_date)}
                    </p>
                  )}
                  {student.latest_notes && (
                    <p className="text-sm text-slate-500 mt-1 italic">“{student.latest_notes}”</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {token && (
          <p className="text-center text-sm text-slate-500">
            Need to change something?{' '}
            <Link href={`/fall-confirm?token=${encodeURIComponent(token)}`} className="text-sky-600 underline">
              Update your answers
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
