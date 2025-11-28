import postgres from 'postgres';
import { revalidatePath } from 'next/cache';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function GET() {
  try {
    const result = await sql.begin(async (tx) => {
      // Get all customers with their students and calculate monthly fees
      const customersWithFees = await tx`
        WITH customer_students AS (
          SELECT 
            c.id as customer_id,
            c.name as customer_name,
            s.id as student_id,
            s.name as student_name
          FROM customers c
          INNER JOIN students s ON s.customer_id = c.id
        ),
        enrollment_costs AS (
          SELECT 
            cs.customer_id,
            cs.customer_name,
            COALESCE(SUM(co.price), 0) as total_enrollment_cost,
            COUNT(DISTINCT e.id) as enrollment_count
          FROM customer_students cs
          LEFT JOIN enrolments e ON e.student_id = cs.student_id
          LEFT JOIN courses co ON co.id = e.course_id
          GROUP BY cs.customer_id, cs.customer_name
        ),
        pickup_costs AS (
          SELECT 
            cs.customer_id,
            cs.customer_name,
            COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) * 40 as total_pickup_cost,
            COUNT(DISTINCT (cs.student_id, p.weekday)) FILTER (WHERE p.id IS NOT NULL) as pickup_count
          FROM customer_students cs
          LEFT JOIN pickups p ON p.student_id = cs.student_id
          GROUP BY cs.customer_id, cs.customer_name
        )
        SELECT 
          ec.customer_id,
          ec.customer_name,
          COALESCE(ec.total_enrollment_cost, 0) as enrollment_cost,
          COALESCE(pc.total_pickup_cost, 0) as pickup_cost,
          (COALESCE(ec.total_enrollment_cost, 0) + COALESCE(pc.total_pickup_cost, 0)) as total_monthly_fee,
          COALESCE(ec.enrollment_count, 0) as enrollment_count,
          COALESCE(pc.pickup_count, 0) as pickup_count
        FROM enrollment_costs ec
        FULL OUTER JOIN pickup_costs pc ON ec.customer_id = pc.customer_id
        WHERE (COALESCE(ec.total_enrollment_cost, 0) + COALESCE(pc.total_pickup_cost, 0)) > 0
        ORDER BY ec.customer_name;
      `;

      let createdCount = 0;
      let skippedCount = 0;
      const startDate = new Date('2025-12-01');

      // Create recurring invoices for each customer
      for (const customer of customersWithFees) {
        const amount = customer.total_monthly_fee * 100; // Convert to cents
        const description = `Monthly fee: ${customer.enrollment_count} enrollment(s), ${customer.pickup_count} pickup(s)`;

        // Check if a recurring invoice already exists for this customer starting Dec 1
        const existing = await tx`
          SELECT id FROM recurring_invoices
          WHERE customer_id = ${customer.customer_id}
            AND start_date = ${startDate.toISOString().split('T')[0]}
            AND description LIKE 'Monthly fee:%'
        `;

        if (existing.length > 0) {
          skippedCount++;
          continue;
        }

        // Create recurring invoice
        await tx`
          INSERT INTO recurring_invoices (
            customer_id,
            amount,
            day_of_month,
            every,
            start_date,
            next_date,
            end_after,
            description
          )
          VALUES (
            ${customer.customer_id},
            ${amount},
            1,
            1,
            ${startDate.toISOString().split('T')[0]},
            ${startDate.toISOString().split('T')[0]},
            NULL,
            ${description}
          )
        `;

        createdCount++;
      }

      return {
        success: true,
        message: `Created ${createdCount} recurring invoices, skipped ${skippedCount} existing`,
        totalCustomers: customersWithFees.length,
        customersWithFees: customersWithFees.map(c => ({
          name: c.customer_name,
          enrollmentCost: c.enrollment_cost,
          pickupCost: c.pickup_cost,
          totalMonthlyFee: c.total_monthly_fee,
          enrollmentCount: c.enrollment_count,
          pickupCount: c.pickup_count
        }))
      };
    });

    revalidatePath('/dashboard/billing');

    return Response.json(result);
  } catch (err: any) {
    console.error('Error seeding invoices:', err);
    return Response.json({ 
      error: String(err?.message ?? err),
      stack: err?.stack 
    }, { status: 500 });
  }
}
