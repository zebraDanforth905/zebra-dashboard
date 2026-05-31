import { fetchParentFormData } from '@/app/lib/summer-data';
import SummerRegForm from '@/app/ui/summer/summer-reg-form';
import { auth } from '@/auth';
import Image from 'next/image';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Summer & Fall Plans | Zebra Robotics',
};

export default async function SummerRegPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; staff?: string }>;
}) {
  const { token, staff } = await searchParams;

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

  const session = staff === '1' ? await auth() : null;
  const sessionUser = session?.user as { name?: string | null; email?: string | null; user_type?: string } | undefined;
  const isStaffEntry = staff === '1' && sessionUser?.user_type === 'admin';
  const staffName = sessionUser?.name || sessionUser?.email || null;

  return (
    <PageShell>
      <div className="space-y-2 mb-6">
        <p className="text-slate-500 text-sm">Hi Zebra Family!</p>
        <h1 className="text-2xl font-semibold text-slate-800">Summer & Fall Plans</h1>
        <div className="rounded-xl bg-sky-50 ring-1 ring-sky-100 px-4 py-3 text-sm text-sky-800 space-y-1">
          <p>Please let us know your summer plans and fall class schedule below. If your child(ren) will attend more than one session per week, you can select multiple time slots.</p>
          <p>We&apos;ll check in again in August to reconfirm before fall classes begin in September, and you&apos;re welcome to review or adjust the enrolment at that time.</p>
        </div>
        {isStaffEntry && (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-100 px-4 py-3 text-sm text-amber-800">
            Staff entry mode{staffName ? `: ${staffName}` : ''}. Submitted responses will be marked as staff-entered.
          </div>
        )}
      </div>
      <SummerRegForm data={data} token={token} staffEntry={isStaffEntry} staffName={staffName} />
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
