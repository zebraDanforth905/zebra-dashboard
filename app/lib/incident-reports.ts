import postgres from 'postgres';
import { cacheTag } from 'next/cache';
import { IncidentReport } from './definitions';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function fetchIncidentReports(statuses?: string[]): Promise<IncidentReport[]> {
  'use cache';
  cacheTag('incident-reports');

  try {
    let query;
    
    if (statuses && statuses.length > 0) {
      query = sql<IncidentReport[]>`
        SELECT 
          ir.id,
          ir.details,
          ir.status,
          ir.user_id,
          ir.date,
          u.name as user_name
        FROM incident_reports ir
        LEFT JOIN users u ON ir.user_id = u.id
        WHERE ir.status = ANY(${statuses})
        ORDER BY ir.date DESC
      `;
    } else {
      query = sql<IncidentReport[]>`
        SELECT 
          ir.id,
          ir.details,
          ir.status,
          ir.user_id,
          ir.date,
          u.name as user_name
        FROM incident_reports ir
        LEFT JOIN users u ON ir.user_id = u.id
        ORDER BY ir.date DESC
      `;
    }

    const reports = await query;
    return reports;
  } catch (error) {
    console.error('Error fetching incident reports:', error);
    throw new Error('Failed to fetch incident reports');
  }
}
