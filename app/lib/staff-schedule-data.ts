'use server'

import postgres from 'postgres';
import { ShiftTemplate, Shift, ShiftAssignment, StaffTimeOff, ShiftTemplateWithAssignments } from './staff-schedule-types';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function fetchShiftTemplates(): Promise<ShiftTemplateWithAssignments[]> {
  try {
    const templates = await sql<ShiftTemplate[]>`
      SELECT 
        st.id,
        st.name,
        st.weekday::integer as weekday,
        st.start_time,
        st.end_time,
        st.shift_type,
        st.is_active,
        st.created_by
      FROM shift_template st
      WHERE st.is_active = true
      ORDER BY st.weekday, st.start_time;
    `;

    // Fetch assignments for each template
    const templatesWithAssignments: ShiftTemplateWithAssignments[] = [];
    for (const template of templates) {
      const assignments = await sql<ShiftAssignment[]>`
        SELECT 
          sa.id,
          sa.template_id,
          sa.shift_id,
          sa.staff_user_id,
          sa.effective_from,
          sa.effective_to,
          sa.role,
          sa.created_by,
          u.name as staff_name
        FROM shift_assignment sa
        JOIN users u ON u.id = sa.staff_user_id
        WHERE sa.template_id = ${template.id}
        ORDER BY sa.effective_from NULLS FIRST, u.name;
      `;

      templatesWithAssignments.push({
        ...template,
        assignments
      });
    }

    return templatesWithAssignments;
  } catch (error) {
    console.error('Error fetching shift templates:', error);
    throw new Error('Failed to fetch shift templates');
  }
}

export async function fetchShifts(startDate?: Date, endDate?: Date): Promise<Shift[]> {
  try {
    const start = startDate || new Date();
    const end = endDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const shifts = await sql<Shift[]>`
      SELECT 
        s.id,
        s.name,
        s.starts_at,
        s.ends_at,
        s.event_type,
        s.notes,
        s.created_by
      FROM shift s
      WHERE s.starts_at >= ${start.toISOString()}
      AND s.starts_at <= ${end.toISOString()}
      ORDER BY s.starts_at;
    `;

    // Fetch assignments for each shift
    const shiftsWithAssignments = await Promise.all(
      shifts.map(async (shift) => {
        const assignments = await sql<ShiftAssignment[]>`
          SELECT 
            sa.id,
            sa.template_id,
            sa.shift_id,
            sa.staff_user_id,
            sa.effective_from,
            sa.effective_to,
            sa.role,
            sa.created_by,
            u.name as staff_name
          FROM shift_assignment sa
          JOIN users u ON u.id = sa.staff_user_id
          WHERE sa.shift_id = ${shift.id}
          ORDER BY u.name;
        `;
        return {
          ...shift,
          assignments
        };
      })
    );

    return shiftsWithAssignments;
  } catch (error) {
    console.error('Error fetching shifts:', error);
    throw new Error('Failed to fetch shifts');
  }
}

export async function fetchShiftAssignments(shiftId: string): Promise<ShiftAssignment[]> {
  try {
    const assignments = await sql<ShiftAssignment[]>`
      SELECT 
        sa.id,
        sa.template_id,
        sa.shift_id,
        sa.staff_user_id,
        sa.effective_from,
        sa.effective_to,
        sa.role,
        sa.created_by,
        u.name as staff_name
      FROM shift_assignment sa
      JOIN users u ON u.id = sa.staff_user_id
      WHERE sa.shift_id = ${shiftId}
      ORDER BY u.name;
    `;

    return assignments;
  } catch (error) {
    console.error('Error fetching shift assignments:', error);
    throw new Error('Failed to fetch shift assignments');
  }
}

export async function fetchStaffTimeOff(staffUserId?: string): Promise<StaffTimeOff[]> {
  try {
    let query;
    
    if (staffUserId) {
      query = sql<StaffTimeOff[]>`
        SELECT 
          sto.id,
          sto.staff_user_id,
          sto.starts_at,
          sto.ends_at,
          sto.time_off_type,
          sto.status,
          sto.notes,
          sto.created_by,
          sto.created_at,
          u.name as staff_name
        FROM staff_time_off sto
        JOIN users u ON u.id = sto.staff_user_id
        WHERE sto.staff_user_id = ${staffUserId}
        AND sto.ends_at >= CURRENT_DATE
        ORDER BY sto.starts_at;
      `;
    } else {
      query = sql<StaffTimeOff[]>`
        SELECT 
          sto.id,
          sto.staff_user_id,
          sto.starts_at,
          sto.ends_at,
          sto.time_off_type,
          sto.status,
          sto.notes,
          sto.created_by,
          sto.created_at,
          u.name as staff_name
        FROM staff_time_off sto
        JOIN users u ON u.id = sto.staff_user_id
        WHERE sto.ends_at >= CURRENT_DATE
        ORDER BY sto.starts_at, u.name;
      `;
    }

    const timeOff = await query;
    return timeOff;
  } catch (error) {
    console.error('Error fetching staff time off:', error);
    throw new Error('Failed to fetch staff time off');
  }
}

export async function fetchStaffUsers(): Promise<Array<{ id: string; name: string; email: string }>> {
  try {
    const users = await sql<Array<{ id: string; name: string; email: string }>>`
      SELECT id, name, email
      FROM users
      ORDER BY name;
    `;

    return users;
  } catch (error) {
    console.error('Error fetching staff users:', error);
    throw new Error('Failed to fetch staff users');
  }
}
