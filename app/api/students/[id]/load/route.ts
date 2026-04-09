import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';

const sql = postgres(process.env.POSTGRES_URL || '', { ssl: 'require' });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { load?: unknown };
  const parsedLoad = Number(body.load);

  if (!Number.isFinite(parsedLoad) || parsedLoad < 0 || parsedLoad > 20) {
    return NextResponse.json(
      { error: 'Load must be a number between 0 and 20' },
      { status: 400 },
    );
  }

  const load = parsedLoad;

  const result = await sql`
    UPDATE students
    SET load = ${load}
    WHERE id::text = ${id}
    RETURNING id::text AS id, COALESCE(load, 1)::float8 AS load
  `;

  if (result.length === 0) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  revalidatePath('/dashboard/students');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/staff-schedule');

  return NextResponse.json({ student: result[0] });
}
