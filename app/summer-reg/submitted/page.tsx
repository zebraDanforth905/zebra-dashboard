import Image from 'next/image';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Submitted | Zebra Robotics',
};

export default function SubmittedPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <Image src="/zebra-logo.png" alt="Zebra Robotics" width={180} height={60} />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-7 w-7 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-800">You're all set!</h1>
          <p className="mt-2 text-slate-500 text-sm">
            We've received your summer schedule preferences. Our staff will review them and be in touch if we have any questions.
          </p>
          <p className="mt-3 text-slate-500 text-sm">
            We'll reach out in August to re-confirm your fall schedule before September begins.
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Need to make a change? Use the same link from your email to resubmit.
          </p>
        </div>
      </main>
    </div>
  );
}
