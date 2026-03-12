import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { fetchUnnassignedStudents } from '@/app/lib/data';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    
    const students = await fetchUnnassignedStudents(query);
    
    return NextResponse.json(students);
  } catch (error) {
    console.error('Error fetching unassigned students:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unassigned students' },
      { status: 500 }
    );
  }
}
