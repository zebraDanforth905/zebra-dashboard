import {
  fetchFallSchedule,
  fetchParentLinkRows,
  fetchSummerResponseRows,
  fetchSummerSchedule,
  fetchSummerSnapshotCourseOptions,
  fetchSummerSnapshotRows,
  fetchSummerStats,
  fetchUntokenizedActiveFamilyCount,
} from '@/app/lib/summer-data';
import { fetchLatestSummerResponseNotes } from '@/app/lib/data';
import LinkManagement from '@/app/ui/summer/link-management';
import ResponsesTab from '@/app/ui/summer/responses-tab';
import SnapshotManagement from '@/app/ui/summer/snapshot-management';
import SummerScheduleTab from '@/app/ui/summer/summer-schedule-tab';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';

export const metadata: Metadata = { title: 'Summer Registration' };

type SessionUserWithType = {
  user_type?: string;
  name?: string;
};

export default async function SummerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const userType = (session?.user as SessionUserWithType | undefined)?.user_type;
  const currentUserName = (session?.user as SessionUserWithType | undefined)?.name || 'Unknown';
  if (userType !== 'admin') {
    redirect('/dashboard');
  }

  const { tab = 'links' } = await searchParams;

  const [linkRows, untokenizedActiveFamilyCount, stats, responseRows, scheduleRows, fallScheduleRows, snapshotRows, snapshotCourseOptions] = await Promise.all([
    tab === 'links' ? fetchParentLinkRows() : null,
    tab === 'links' ? fetchUntokenizedActiveFamilyCount() : null,
    tab === 'responses' ? fetchSummerStats() : null,
    tab === 'responses' ? fetchSummerResponseRows() : null,
    tab === 'schedule' ? fetchSummerSchedule() : null,
    tab === 'fall-schedule' ? fetchFallSchedule() : null,
    tab === 'snapshot' ? fetchSummerSnapshotRows() : null,
    tab === 'snapshot' ? fetchSummerSnapshotCourseOptions() : null,
  ]);
  let enrichedResponseRows = responseRows;

  if (tab === 'responses' && responseRows) {
    const latestNotes = await fetchLatestSummerResponseNotes(
      responseRows.map(row => row.student_id),
      responseRows.map(row => row.customer_id),
    );
    const studentNotesById = new Map(latestNotes.studentNotes.map(note => [note.student_id, note]));
    const customerNotesById = new Map(latestNotes.customerNotes.map(note => [note.customer_id, note]));

    enrichedResponseRows = responseRows.map(row => ({
      ...row,
      ...(studentNotesById.get(row.student_id) ?? {}),
      ...(customerNotesById.get(row.customer_id) ?? {}),
    }));
  }

  return (
    <div className="m-3 md:m-6">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Summer Registration</h1>
        <p className="text-sm text-slate-500 mt-1">Manage family links, review responses, and view the summer schedule.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        <TabLink href="/dashboard/summer?tab=links" active={tab === 'links'}>
          Link Management
        </TabLink>
        <TabLink href="/dashboard/summer?tab=responses" active={tab === 'responses'}>
          Responses
        </TabLink>
        <TabLink href="/dashboard/summer?tab=schedule" active={tab === 'schedule'}>
          Summer Schedule
        </TabLink>
        <TabLink href="/dashboard/summer?tab=fall-schedule" active={tab === 'fall-schedule'}>
          Fall Schedule
        </TabLink>
        <TabLink href="/dashboard/summer?tab=snapshot" active={tab === 'snapshot'}>
          Snapshot Add / Remove
        </TabLink>
      </div>

      {tab === 'links' && linkRows && (
        <LinkManagement
          rows={linkRows}
          untokenizedActiveFamilyCount={untokenizedActiveFamilyCount ?? 0}
        />
      )}

      {tab === 'responses' && stats && enrichedResponseRows && (
        <ResponsesTab rows={enrichedResponseRows} stats={stats} currentUserName={currentUserName} />
      )}

      {tab === 'schedule' && scheduleRows && (
        <SummerScheduleTab rows={scheduleRows} term="summer" />
      )}

      {tab === 'fall-schedule' && fallScheduleRows && (
        <SummerScheduleTab rows={fallScheduleRows} term="fall" />
      )}

      {tab === 'snapshot' && snapshotRows && snapshotCourseOptions && (
        <SnapshotManagement rows={snapshotRows} courseOptions={snapshotCourseOptions} />
      )}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active
          ? 'border-sky-600 text-sky-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </a>
  );
}
