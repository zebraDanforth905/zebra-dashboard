'use server';

import { auth } from '@/auth';
import { revalidateTag } from 'next/cache';
import postgres from 'postgres';
import { z } from 'zod';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const IncidentReportFormSchema = z.object({
  incident_date: z.string().min(1, 'Date is required'),
  incident_time: z.string().min(1, 'Time is required'),
  student_name: z.string().min(1, 'Student name is required'),
  coaches: z.array(z.string()).min(1, 'At least one coach is required'),
  what_happened: z.string().min(10, 'Please describe what happened (minimum 10 characters)'),
  what_led_up: z.string().min(10, 'Please describe what led up to the incident (minimum 10 characters)'),
  other_students: z.array(z.string()).optional(),
  parent_involvement: z.string().min(10, 'Please describe parent involvement (minimum 10 characters)'),
  how_addressed: z.string().min(10, 'Please describe how the situation was addressed (minimum 10 characters)'),
});

export async function createIncidentReport(prevState: any, formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false,
      error: 'You must be logged in to submit an incident report',
    };
  }

  const coaches: string[] = [];
  let coachIndex = 0;
  while (formData.has(`coach_${coachIndex}`)) {
    const coach = formData.get(`coach_${coachIndex}`)?.toString().trim();
    if (coach) coaches.push(coach);
    coachIndex++;
  }

  const otherStudents: string[] = [];
  let studentIndex = 0;
  while (formData.has(`other_student_${studentIndex}`)) {
    const student = formData.get(`other_student_${studentIndex}`)?.toString().trim();
    if (student) otherStudents.push(student);
    studentIndex++;
  }

  const validatedFields = IncidentReportFormSchema.safeParse({
    incident_date: formData.get('incident_date'),
    incident_time: formData.get('incident_time'),
    student_name: formData.get('student_name'),
    coaches,
    what_happened: formData.get('what_happened'),
    what_led_up: formData.get('what_led_up'),
    other_students: otherStudents.length > 0 ? otherStudents : undefined,
    parent_involvement: formData.get('parent_involvement'),
    how_addressed: formData.get('how_addressed'),
  });

  if (!validatedFields.success) {
    const errors = validatedFields.error.flatten().fieldErrors;
    const firstError = Object.values(errors)[0]?.[0];
    return {
      ok: false,
      error: firstError || 'Invalid form data',
    };
  }

  const data = validatedFields.data;

  try {
    const currentDate = new Date();

    const details = {
      incident_date: data.incident_date,
      incident_time: data.incident_time,
      student_name: data.student_name,
      coaches: data.coaches,
      what_happened: data.what_happened,
      what_led_up: data.what_led_up,
      other_students: data.other_students || [],
      parent_involvement: data.parent_involvement,
      how_addressed: data.how_addressed,
    };

    await sql`
      INSERT INTO incident_reports (details, status, user_id, date)
      VALUES (${JSON.stringify(details)}, 'new', ${session.user.id}, ${currentDate})
    `;

    revalidateTag('incident-reports', 'max');
    return {
      ok: true,
      message: 'Incident report submitted successfully',
    };
  } catch (error) {
    console.error('Error creating incident report:', error);
    return {
      ok: false,
      error: 'Failed to submit incident report. Please try again.',
    };
  }
}
