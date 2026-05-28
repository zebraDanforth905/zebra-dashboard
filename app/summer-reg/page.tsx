import { fetchParentFormData } from '@/app/lib/summer-data';
import SummerRegForm from '@/app/ui/summer/summer-reg-form';
import Image from 'next/image';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Summer & Fall Schedule | Zebra Robotics',
};

export default async function SummerRegPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) return <PageShell><InvalidLink /></PageShell>;

  const data = await fetchParentFormData(token);

  if (!data) return <PageShell><InvalidLink /></PageShell>;

  if (data.summer_sessions.length === 0) {
    return (
      <PageShell>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
          <p className="text-slate-700 font-medium">Summer times coming soon — check back shortly.</p>
          <p className="text-slate-500 text-sm mt-2">
            We&apos;re finalizing the summer schedule. This link will be ready once sessions are posted.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-2 mb-6">
        <p className="text-slate-500 text-sm">Hi Zebra family,</p>
        <h1 className="text-2xl font-semibold text-slate-800">Summer & Fall Schedule</h1>
        <div className="rounded-xl bg-sky-50 ring-1 ring-sky-100 px-4 py-3 text-sm text-sky-800 space-y-1">
          <p>Please use this form to share your child&apos;s preferred schedule for July and August, plus your plan for classes starting in September.</p>
          <p>For summer, choose whether your child will continue weekly classes, take a break, or request a custom plan.</p>
          <p>You can select multiple sessions if your child will attend more than once per week.</p>
          <p>Our team will follow up in August if anything needs confirming before classes begin in September.</p>
        </div>
      </div>
      <SummerRegForm data={data} token={token} />
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 px-6 py-5">
        <div className="mx-auto max-w-2xl">
          <Image src="/zebra-logo.png" alt="Zebra Robotics" width={180} height={60} />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
      <p className="text-slate-700 font-medium">This link is not valid.</p>
      <p className="text-slate-500 text-sm mt-2">
        Please check the email you received and try again, or contact us for a new link.
      </p>
    </div>
  );
}
