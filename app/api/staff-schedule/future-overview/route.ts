import { auth } from '@/auth';
import { fetchFutureStaffScheduleOverview } from '@/app/lib/staff-schedule-data';

export async function GET(request: Request) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.user_type === 'admin';

  if (!isAdmin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || undefined;
  const overview = await fetchFutureStaffScheduleOverview(month);
  return Response.json(overview);
}
