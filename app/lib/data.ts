import postgres from 'postgres';
import { CustomerTableData } from './definitions';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const ITEMS_PER_PAGE = 10;
export async function fetchFilteredCustomers(
  query: string,
  currentPage: number,
  sortBy: string,
  incDec: boolean,
) {

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  console.log(`Fetching customers with query: ${query}, page: ${currentPage}, sortBy: ${sortBy}, order: ${incDec}`);

  try {
    const customers = await sql<CustomerTableData[]>`
    WITH inv AS (
        SELECT customer_id, COALESCE(SUM(amount),0) AS sum_invoices
        FROM invoices GROUP BY customer_id
        ),
        pay AS (
        SELECT
            customer_id,
            COALESCE(SUM(amount) FILTER (WHERE status='submitted'),0) AS sum_payments,
            MIN(date)   FILTER (WHERE status='scheduled') AS next_payment_date,
            MIN(amount) FILTER (WHERE status='scheduled') AS next_payment_amount,
            AVG(amount) FILTER (WHERE status='scheduled') AS regular_payment_amount
        FROM payments GROUP BY customer_id
        ),
        stu AS (
        SELECT
            customer_id,
            COALESCE(
            JSONB_AGG(JSONB_BUILD_OBJECT('id', id, 'name', name) ORDER BY name),
            '[]'::jsonb
            ) AS students
        FROM students
        GROUP BY customer_id
        )
        SELECT
        c.id,
        c.name,
        c.email,
        COALESCE(inv.sum_invoices,0) - COALESCE(pay.sum_payments,0) AS total_due,
        pay.next_payment_date,
        pay.next_payment_amount,
        pay.regular_payment_amount,
        COALESCE(stu.students, '[]'::jsonb) AS students
        FROM customers c
        LEFT JOIN inv ON inv.customer_id = c.id
        LEFT JOIN pay ON pay.customer_id = c.id
        LEFT JOIN stu ON stu.customer_id = c.id
        WHERE (c.name ILIKE '%' || ${query} || '%' OR c.email ILIKE '%' || ${query} || '%')
        ORDER BY ${sql(sortBy)} DESC
        LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset};
        `
        return customers;

    
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customers.');
  }
}

export async function fetchCustomerPages(query: string) {
  try {
    const data = await sql`SELECT COUNT(*)
    FROM customers
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of customers.');
  }
}