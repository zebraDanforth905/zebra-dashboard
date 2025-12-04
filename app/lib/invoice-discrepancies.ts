'use server'

import postgres from 'postgres';
import { cacheTag } from 'next/cache';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function fetchInvoiceDiscrepancies() {
  'use cache'
  cacheTag('invoices');
  cacheTag('customers');
  try {
    // Calculate expected monthly fees for each customer based on active enrollments and pickups
    const discrepancies = await sql<Array<{
      customer_id: string;
      customer_name: string;
      expected_amount: number;
      expected_enrollment_cost: number;
      expected_pickup_cost: number;
      enrollment_count: number;
      pickup_count: number;
      recurring_invoice_id: string | null;
      recurring_invoice_amount: number | null;
      recurring_invoice_description: string | null;
      recurring_invoice_next_date: Date | null;
      difference: number | null;
      recent_note: string | null;
      note_date: Date | null;
      note_creator: string | null;
    }>>`
      WITH customer_students AS (
        SELECT 
          c.id as customer_id,
          c.name as customer_name,
          c.set_up_qbo as set_up_qbo,
          s.id as student_id
        FROM customers c
        LEFT JOIN students s ON s.customer_id = c.id
      ),
      enrollment_costs AS (
        SELECT 
          cs.customer_id,
          cs.customer_name,
          cs.set_up_qbo,
          COALESCE(SUM(co.price), 0) as expected_enrollment_cost,
          COUNT(DISTINCT e.id) as enrollment_count
        FROM customer_students cs
        LEFT JOIN enrolments e ON e.student_id = cs.student_id
        LEFT JOIN courses co ON co.id = e.course_id
        GROUP BY cs.customer_id, cs.customer_name, cs.set_up_qbo
      ),
      pickup_costs AS (
        SELECT 
          cs.customer_id,
          COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) * 40 as expected_pickup_cost,
          COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) as pickup_count
        FROM customer_students cs
        LEFT JOIN pickups p ON p.student_id = cs.student_id
        GROUP BY cs.customer_id
      ),
      recurring_invoices_monthly AS (
        SELECT 
          customer_id,
          id as recurring_invoice_id,
          amount as recurring_invoice_amount,
          description as recurring_invoice_description,
          next_date as recurring_invoice_next_date,
          ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY next_date DESC NULLS LAST, start_date DESC) as rn
        FROM recurring_invoices
      ),
      recent_customer_notes AS (
        SELECT DISTINCT ON (customer_id)
          customer_id,
          content as recent_note,
          date as note_date,
          creator as note_creator
        FROM customer_notes
        ORDER BY customer_id, date DESC, id DESC
      )
      SELECT 
        ec.customer_id,
        ec.customer_name,
        (COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100 as expected_amount,
        ec.expected_enrollment_cost,
        COALESCE(pc.expected_pickup_cost, 0) as expected_pickup_cost,
        COALESCE(ec.enrollment_count, 0) as enrollment_count,
        COALESCE(pc.pickup_count, 0) as pickup_count,
        ri.recurring_invoice_id,
        ri.recurring_invoice_amount,
        ri.recurring_invoice_description,
        ri.recurring_invoice_next_date,
        CASE 
          WHEN ri.recurring_invoice_amount IS NOT NULL 
          THEN ri.recurring_invoice_amount - ((COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100)
          ELSE NULL
        END as difference,
        cn.recent_note,
        cn.note_date,
        cn.note_creator
      FROM enrollment_costs ec
      LEFT JOIN pickup_costs pc ON ec.customer_id = pc.customer_id
      LEFT JOIN recurring_invoices_monthly ri ON ec.customer_id = ri.customer_id AND ri.rn = 1
      LEFT JOIN recent_customer_notes cn ON ec.customer_id = cn.customer_id
      WHERE 
        -- Only show customers with enrollments or pickups
        (COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) > 0
        -- Ignore QBO set up customers (check the set_up_qbo column)
        AND (ec.set_up_qbo IS NULL OR ec.set_up_qbo = false)
        AND (
          -- Has no recurring invoice
          ri.recurring_invoice_id IS NULL
          -- OR has recurring invoice with different amount
          OR ri.recurring_invoice_amount != ((COALESCE(ec.expected_enrollment_cost, 0) + COALESCE(pc.expected_pickup_cost, 0)) * 100)
        )
      ORDER BY ec.customer_name;
    `;
    
    return discrepancies;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice discrepancies.');
  }
}
