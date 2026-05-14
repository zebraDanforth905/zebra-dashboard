// Reconcile v2 — handles case-insensitive email + orphans that captured students.
//
// Detects duplicate customer rows where (name, LOWER(TRIM(email))) is shared but
// portal_parent_id is split: one row NULL, one row set.
//
// "live" = pp-NULL row that holds tokens / billing / most students
// "orphan" = pp-set row, typically with 0 billing/tokens but may have captured a
//            child student via syncCustomers.
//
// Per pair:
//   1. Assert orphan has no billing FKs (invoices/payments/recurring_invoices/
//      converge_recurring_payments). If billing present, skip + log.
//   2. Move any students from orphan → live (orphan must keep zero student rows).
//   3. Clear orphan.portal_parent_id (frees unique key).
//   4. Copy portal_parent_id, alternate_email, alternate_name from orphan → live
//      respecting *_locked flags + only filling NULLs on live.
//
// Usage:
//   node scripts/reconcile_customer_dupes_v2.mjs            # dry-run
//   node scripts/reconcile_customer_dupes_v2.mjs --apply

import postgres from "../node_modules/postgres/src/index.js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^POSTGRES_URL=(.+)$/m)[1].trim();
const sql = postgres(url, { ssl: "require" });

async function main() {
  const pairs = await sql`
    WITH g AS (
      SELECT name, LOWER(TRIM(email)) AS email_norm, COUNT(*)::int AS n,
        SUM(CASE WHEN portal_parent_id IS NULL THEN 1 ELSE 0 END)::int AS null_n,
        SUM(CASE WHEN portal_parent_id IS NOT NULL THEN 1 ELSE 0 END)::int AS pp_n
      FROM customers GROUP BY name, LOWER(TRIM(email))
    )
    SELECT name, email_norm FROM g WHERE n=2 AND null_n=1 AND pp_n=1 ORDER BY name
  `;

  let reconciled = 0;
  let skipped = 0;
  const skipLog = [];

  for (const { name, email_norm } of pairs) {
    const rows = await sql`
      SELECT id::text, name, email, alternate_email, alternate_name,
             portal_parent_id, alternate_email_locked, alternate_name_locked
      FROM customers
      WHERE name = ${name} AND LOWER(TRIM(email)) = ${email_norm}
    `;
    const live = rows.find(r => r.portal_parent_id === null);
    const orphan = rows.find(r => r.portal_parent_id !== null);
    if (!live || !orphan) { skipped++; skipLog.push({ name, reason: "shape_changed" }); continue; }

    const [{ n: liveStu }] = await sql`SELECT COUNT(*)::int AS n FROM students WHERE customer_id=${live.id}::uuid`;
    const [{ n: orphanStu }] = await sql`SELECT COUNT(*)::int AS n FROM students WHERE customer_id=${orphan.id}::uuid`;
    if (liveStu === 0 && orphanStu > 0) {
      // Inverted shape: pp-set row is actually the live one. Skip — would need careful manual handling.
      skipped++;
      skipLog.push({ name, liveId: live.id, orphanId: orphan.id, reason: "inverted_shape (pp-set holds students, pp-null empty)" });
      continue;
    }
    if (liveStu === 0 && orphanStu === 0) {
      // Both empty — nothing to reconcile by data. Still copy pp + alt to live so refresh can run.
    }

    // Check billing on orphan
    const [{ n: inv }] = await sql`SELECT COUNT(*)::int AS n FROM invoices WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: pay }] = await sql`SELECT COUNT(*)::int AS n FROM payments WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: rec }] = await sql`SELECT COUNT(*)::int AS n FROM recurring_invoices WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: conv }] = await sql`SELECT COUNT(*)::int AS n FROM converge_recurring_payments WHERE customer_id=${orphan.id}::uuid`;
    const [{ n: tok }] = await sql`SELECT COUNT(*)::int AS n FROM parent_tokens WHERE customer_id=${orphan.id}::uuid`;
    if (inv + pay + rec + conv + tok > 0) {
      skipped++;
      skipLog.push({ name, orphanId: orphan.id, reason: "orphan_has_billing_or_token", counts: { inv, pay, rec, conv, tok } });
      continue;
    }

    const willCopyAltEmail = live.alternate_email === null
      && !live.alternate_email_locked
      && orphan.alternate_email !== null;
    const willCopyAltName = live.alternate_name === null
      && !live.alternate_name_locked
      && orphan.alternate_name !== null;

    console.log(
      `${APPLY ? "APPLY" : "DRY"}  ${name}  pp=${orphan.portal_parent_id}  moveStudents=${orphanStu}` +
      (willCopyAltEmail ? `  +altEmail=${orphan.alternate_email}` : "") +
      (willCopyAltName ? `  +altName=${orphan.alternate_name}` : ""),
    );

    if (APPLY) {
      await sql.begin(async tx => {
        if (orphanStu > 0) {
          await tx`UPDATE students SET customer_id = ${live.id}::uuid WHERE customer_id = ${orphan.id}::uuid`;
        }
        await tx`UPDATE customers SET portal_parent_id = NULL WHERE id = ${orphan.id}::uuid`;
        await tx`
          UPDATE customers
          SET portal_parent_id = ${orphan.portal_parent_id},
              alternate_email = CASE WHEN ${willCopyAltEmail}::boolean THEN ${orphan.alternate_email} ELSE alternate_email END,
              alternate_name  = CASE WHEN ${willCopyAltName}::boolean  THEN ${orphan.alternate_name}  ELSE alternate_name  END
          WHERE id = ${live.id}::uuid
        `;
      });
    }
    reconciled++;
  }

  console.log(`\nReconciled: ${reconciled}, Skipped: ${skipped}, Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  if (skipLog.length) console.log("\nSkip details:\n" + JSON.stringify(skipLog, null, 2));
}

await main();
await sql.end();
