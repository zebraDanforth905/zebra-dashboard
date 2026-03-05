import { NextRequest, NextResponse } from 'next/server';
import { searchStudents } from '@/app/lib/data';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ students: [] });
    }

    const students = await searchStudents(query);
    
    return NextResponse.json({ students });
  } catch (error) {
    console.error('Error searching students:', error);
    return NextResponse.json(
      { error: 'Failed to search students' },
      { status: 500 }
    );
  }
}
