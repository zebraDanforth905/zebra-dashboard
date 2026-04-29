// One-off audit: find duplicate / self-loop customer rows before any backfill or merge.
// Run: node --env-file=.env.local scripts/audit-duplicate-customers.mjs

import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require' });

function hr(label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(70));
}

// ── 1. Self-loop rows ────────────────────────────────────────────────────────
// alternate_email same as email, or alternate_name same as name.
// These should have been filtered by the normalize guard but may exist from
// historical syncs before the guard was added.
hr('1. SELF-LOOP ROWS (alternate = primary)');

const selfLoop = await sql`
  SELECT
    id,
    name,
    email,
    alternate_email,
    alternate_name,
    portal_parent_id
  FROM customers
  WHERE
    (alternate_email IS NOT NULL AND lower(trim(alternate_email)) = lower(trim(email)))
    OR (alternate_name IS NOT NULL AND lower(trim(alternate_name)) = lower(trim(name)))
  ORDER BY name
`;
console.log(`Found: ${selfLoop.length}`);
for (const r of selfLoop) console.log(JSON.stringify(r));

// ── 2. Duplicate email groups ────────────────────────────────────────────────
// Multiple customer rows with the same primary email.
// Shows token ownership, email_sent_count, and student assignments per row.
hr('2. DUPLICATE CUSTOMER ROWS — BY EMAIL (with token + student ownership)');

const emailDups = await sql`
  WITH dup_emails AS (
    SELECT lower(trim(email)) AS norm_email
    FROM customers
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
  )
  SELECT
    de.norm_email,
    c.id,
    c.name,
    c.email,
    c.alternate_email,
    c.alternate_name,
    c.portal_parent_id,
    pt.id                       AS token_id,
    pt.token,
    pt.email_sent_count,
    COUNT(s.id)::int            AS student_count,
    string_agg(s.name, ', ' ORDER BY s.name) AS students
  FROM dup_emails de
  JOIN customers c ON lower(trim(c.email)) = de.norm_email
  LEFT JOIN parent_tokens pt ON pt.customer_id = c.id
  LEFT JOIN students s ON s.customer_id = c.id
  GROUP BY de.norm_email, c.id, c.name, c.email, c.alternate_email,
           c.alternate_name, c.portal_parent_id, pt.id, pt.token, pt.email_sent_count
  ORDER BY de.norm_email, c.id
`;
console.log(`Found: ${emailDups.length} rows across ${new Set(emailDups.map(r => r.norm_email)).size} duplicate email groups`);
for (const r of emailDups) console.log(JSON.stringify(r));

// ── 3. Duplicate name groups ─────────────────────────────────────────────────
// Multiple customer rows with same primary name.
// A name collision with different emails is suspicious but may be unrelated families.
hr('3. DUPLICATE CUSTOMER ROWS — BY NAME');

const nameDups = await sql`
  WITH dup_names AS (
    SELECT lower(trim(name)) AS norm_name
    FROM customers
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
  )
  SELECT
    dn.norm_name,
    c.id,
    c.name,
    c.email,
    c.alternate_email,
    c.alternate_name,
    c.portal_parent_id,
    (pt.id IS NOT NULL)         AS has_token,
    COUNT(s.id)::int            AS student_count,
    string_agg(s.name, ', ' ORDER BY s.name) AS students
  FROM dup_names dn
  JOIN customers c ON lower(trim(c.name)) = dn.norm_name
  LEFT JOIN parent_tokens pt ON pt.customer_id = c.id
  LEFT JOIN students s ON s.customer_id = c.id
  GROUP BY dn.norm_name, c.id, c.name, c.email, c.alternate_email,
           c.alternate_name, c.portal_parent_id, pt.id
  ORDER BY dn.norm_name, c.id
`;
console.log(`Found: ${nameDups.length} rows across ${new Set(nameDups.map(r => r.norm_name)).size} duplicate name groups`);
for (const r of nameDups) console.log(JSON.stringify(r));

// ── 4. alternate_email points to another customer — no shared students ────────
// These are candidates where the bridge wrote a cross-customer link that doesn't
// reflect an actual co-parent relationship.
hr('4. alternate_email POINTS TO ANOTHER CUSTOMER — check shared students');

const crossLinks = await sql`
  SELECT
    c.id             AS customer_id,
    c.name,
    c.email,
    c.alternate_email,
    c.alternate_name,
    c.portal_parent_id,
    other.id         AS other_customer_id,
    other.name       AS other_name,
    other.email      AS other_email,
    other.portal_parent_id AS other_portal_parent_id,
    COUNT(DISTINCT s1.id)::int  AS this_student_count,
    COUNT(DISTINCT s2.id)::int  AS other_student_count,
    (
      SELECT count(*) FROM students sa
      JOIN students sb ON sa.id = sb.id
      WHERE sa.customer_id = c.id AND sb.customer_id = other.id
    )::int  AS shared_student_count
  FROM customers c
  JOIN customers other
    ON lower(trim(c.alternate_email)) = lower(trim(other.email))
    AND c.id != other.id
  LEFT JOIN students s1 ON s1.customer_id = c.id
  LEFT JOIN students s2 ON s2.customer_id = other.id
  GROUP BY c.id, c.name, c.email, c.alternate_email, c.alternate_name,
           c.portal_parent_id, other.id, other.name, other.email, other.portal_parent_id
  ORDER BY c.name
`;
console.log(`Found: ${crossLinks.length}`);
for (const r of crossLinks) console.log(JSON.stringify(r));

// ── 5. Null portal_parent_id rows ────────────────────────────────────────────
// Rows with no portal link can't be deduped by ON CONFLICT (portal_parent_id).
// Must check if these overlap with portal-synced rows before any merge.
hr('5. CUSTOMERS WITH portal_parent_id = NULL (no portal anchor)');

const nullPortal = await sql`
  SELECT
    c.id,
    c.name,
    c.email,
    c.alternate_email,
    c.alternate_name,
    (pt.id IS NOT NULL)       AS has_token,
    pt.email_sent_count,
    COUNT(s.id)::int          AS student_count,
    string_agg(s.name, ', ' ORDER BY s.name) AS students
  FROM customers c
  LEFT JOIN parent_tokens pt ON pt.customer_id = c.id
  LEFT JOIN students s ON s.customer_id = c.id
  WHERE c.portal_parent_id IS NULL
  GROUP BY c.id, c.name, c.email, c.alternate_email, c.alternate_name, pt.id, pt.email_sent_count
  ORDER BY c.name
`;
console.log(`Found: ${nullPortal.length}`);
for (const r of nullPortal) console.log(JSON.stringify(r));

// ── 6. Summary counts ────────────────────────────────────────────────────────
hr('SUMMARY');
const [totals] = await sql`
  SELECT
    count(*)::int                                            AS total_customers,
    count(*) FILTER (WHERE portal_parent_id IS NULL)::int   AS null_portal_id,
    count(*) FILTER (WHERE alternate_email IS NOT NULL)::int AS has_alternate_email,
    count(*) FILTER (WHERE alternate_name  IS NOT NULL)::int AS has_alternate_name
  FROM customers
`;
console.log(JSON.stringify(totals));

await sql.end();
console.log('\nDone.');
