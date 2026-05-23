const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

function loadPostgresUrlFromEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((l) => l.startsWith('POSTGRES_URL='));
  if (!line) return null;
  return line.replace(/^POSTGRES_URL=/, '').trim().replace(/^"|"$/g, '');
}

const POSTGRES_URL = process.env.POSTGRES_URL || loadPostgresUrlFromEnvFile();
if (!POSTGRES_URL) {
  console.error('POSTGRES_URL not found in environment or .env file');
  process.exit(1);
}

const sql = postgres(POSTGRES_URL, { ssl: 'require' });

function qid(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

async function getDuplicateSummary(db) {
  const rows = await db.unsafe(`
    WITH d AS (
      SELECT LOWER(TRIM(email)) AS email_key, COUNT(*)::int AS cnt
      FROM customers
      WHERE email IS NOT NULL AND TRIM(email) <> ''
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    )
    SELECT COUNT(*)::int AS duplicate_groups,
           COALESCE(SUM(cnt), 0)::int AS rows_in_duplicate_groups
    FROM d
  `);
  return rows[0] || { duplicate_groups: 0, rows_in_duplicate_groups: 0 };
}

async function main() {
  const before = await getDuplicateSummary(sql);

  const duplicateGroups = await sql.unsafe(`
    SELECT LOWER(TRIM(email)) AS email_key,
           ARRAY_AGG(id::text ORDER BY
             CASE WHEN portal_parent_id IS NOT NULL THEN 1 ELSE 0 END DESC,
             CASE WHEN set_up_qbo IS TRUE THEN 1 ELSE 0 END DESC,
             id
           ) AS ids
    FROM customers
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
    ORDER BY email_key
  `);

  if (duplicateGroups.length === 0) {
    console.log(JSON.stringify({ before, message: 'No duplicates found', mergedCustomers: 0, after: before }, null, 2));
    await sql.end({ timeout: 5 });
    return;
  }

  const fkRefs = await sql.unsafe(`
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class cref ON cref.oid = con.confrelid
    JOIN pg_namespace nref ON nref.oid = cref.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ck.attnum
    WHERE con.contype = 'f'
      AND nref.nspname = 'public'
      AND cref.relname = 'customers'
      AND n.nspname = 'public'
    ORDER BY table_schema, table_name, column_name
  `);

  const hasParentTokens = (await sql.unsafe(`SELECT to_regclass('public.parent_tokens') IS NOT NULL AS exists`))[0]?.exists;
  const hasParentRequests = (await sql.unsafe(`SELECT to_regclass('public.parent_requests') IS NOT NULL AS exists`))[0]?.exists;

  let mergedCustomers = 0;
  const touchedReferenceColumns = new Set();

  await sql.begin(async (tx) => {
    for (const group of duplicateGroups) {
      const ids = group.ids || [];
      if (ids.length <= 1) continue;

      const winnerId = ids[0];
      const duplicateIds = ids.slice(1);

      for (const duplicateId of duplicateIds) {
        const dupRows = await tx.unsafe(`
          SELECT id::text, name, email, alternate_name, alternate_email, portal_parent_id, set_up_qbo
          FROM customers
          WHERE id = $1::uuid
          LIMIT 1
        `, [duplicateId]);

        if (dupRows.length === 0) continue;
        const dup = dupRows[0];

        await tx.unsafe(`
          UPDATE customers c
          SET
            name = CASE WHEN c.name IS NULL OR TRIM(c.name) = '' THEN $2 ELSE c.name END,
            email = CASE WHEN c.email IS NULL OR TRIM(c.email) = '' THEN $3 ELSE c.email END,
            alternate_name = COALESCE(NULLIF(TRIM(c.alternate_name), ''), NULLIF(TRIM($4), '')),
            alternate_email = COALESCE(NULLIF(LOWER(TRIM(c.alternate_email)), ''), NULLIF(LOWER(TRIM($5)), '')),
            portal_parent_id = COALESCE(c.portal_parent_id, $6),
            set_up_qbo = COALESCE(c.set_up_qbo, FALSE) OR COALESCE($7, FALSE)
          WHERE c.id = $1::uuid
        `, [winnerId, dup.name, dup.email, dup.alternate_name, dup.alternate_email, dup.portal_parent_id, dup.set_up_qbo]);

        if (hasParentTokens) {
          const winnerToken = await tx.unsafe('SELECT id::text FROM parent_tokens WHERE customer_id = $1::uuid LIMIT 1', [winnerId]);
          const dupTokens = await tx.unsafe('SELECT id::text FROM parent_tokens WHERE customer_id = $1::uuid', [duplicateId]);

          if (dupTokens.length > 0) {
            if (winnerToken.length > 0) {
              const dupTokenIds = dupTokens.map((t) => t.id);
              if (hasParentRequests) {
                await tx.unsafe(`
                  UPDATE parent_requests
                  SET token_id = $1::uuid
                  WHERE token_id = ANY($2::uuid[])
                `, [winnerToken[0].id, dupTokenIds]);
              }
              await tx.unsafe('DELETE FROM parent_tokens WHERE id = ANY($1::uuid[])', [dupTokenIds]);
            } else {
              await tx.unsafe(`
                UPDATE parent_tokens
                SET customer_id = $1::uuid
                WHERE customer_id = $2::uuid
              `, [winnerId, duplicateId]);
            }
          }
        }

        for (const ref of fkRefs) {
          if (ref.table_name === 'parent_tokens') continue;
          const tableName = `${qid(ref.table_schema)}.${qid(ref.table_name)}`;
          const col = qid(ref.column_name);
          await tx.unsafe(`UPDATE ${tableName} SET ${col} = $1::uuid WHERE ${col} = $2::uuid`, [winnerId, duplicateId]);
          touchedReferenceColumns.add(`${ref.table_schema}.${ref.table_name}.${ref.column_name}`);
        }

        await tx.unsafe('DELETE FROM customers WHERE id = $1::uuid', [duplicateId]);
        mergedCustomers += 1;
      }
    }
  });

  const after = await getDuplicateSummary(sql);

  console.log(JSON.stringify({
    before,
    duplicateGroupCountProcessed: duplicateGroups.length,
    mergedCustomers,
    after,
    touchedReferenceColumns: Array.from(touchedReferenceColumns).sort(),
  }, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
