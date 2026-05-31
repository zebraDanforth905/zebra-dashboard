// Backfill / refresh customers.alternate_name + alternate_email
// from portal /family-view/family/{portal_parent_id}.
//
// Default: DRY RUN — fetches everything, reports what WOULD change, writes nothing.
// Apply: append ?apply=1 to actually UPDATE rows.
//
// Modes:
//   ?mode=fill              (default) — only fills NULL alt fields, COALESCE update, never overwrites
//   ?mode=dedupe            — only NULLs alt fields when self-loop or no-coparent; never overwrites legit data
//   ?mode=refresh           — overwrites alt fields with portal truth; clears them on self-loop / no-coparent
//   ?mode=clear-self-dupe   — pure DB cleanup, no portal fetch: NULLs alt fields where alt == primary
//                              (catches duplicate customer rows with no portal_parent_id)
//
// Optional params:
//   ?limit=N            — only process first N customers (for testing)
//   ?customerId=<uuid>  — only process one customer (for spot-check)
//
// Requires BACKFILL_ALT_PARENTS_SECRET via `x-job-secret` header or `?secret=...`.

import { NextResponse } from "next/server";
import { connection } from "next/server";
import postgres from "postgres";
import { fetchFamilyView } from "@/app/lib/scraper_helpers";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });
const BACKFILL_SECRET = process.env.BACKFILL_ALT_PARENTS_SECRET;

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  alternate_email: string | null;
  alternate_name: string | null;
  portal_parent_id: number;
};

type Outcome =
  | { kind: "skip_no_coparent"; customerId: string; familyId: number; primaryName: string }
  | { kind: "skip_self_loop"; customerId: string; familyId: number; reason: string }
  | { kind: "skip_already_set"; customerId: string; familyId: number }
  | { kind: "skip_already_correct"; customerId: string; familyId: number }
  | { kind: "skip_fetch_failed"; customerId: string; familyId: number }
  | {
      kind: "would_update";
      customerId: string;
      familyId: number;
      primaryName: string;
      currentAltName: string | null;
      newAltName: string | null;
      currentAltEmail: string | null;
      newAltEmail: string | null;
    }
  | {
      kind: "updated";
      customerId: string;
      familyId: number;
      primaryName: string;
      newAltName: string | null;
      newAltEmail: string | null;
    }
  | {
      kind: "would_refresh";
      customerId: string;
      familyId: number;
      primaryName: string;
      currentAltName: string | null;
      newAltName: string | null;
      currentAltEmail: string | null;
      newAltEmail: string | null;
      reason: "match" | "self_loop_clear" | "no_coparent_clear";
    }
  | {
      kind: "refreshed";
      customerId: string;
      familyId: number;
      primaryName: string;
      newAltName: string | null;
      newAltEmail: string | null;
      reason: "match" | "self_loop_clear" | "no_coparent_clear";
    };

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function nameTokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

// Returns true if the alt name appears to be an intentional combined edit ("X & Y", "X and Y").
function looksLikeCombinedEdit(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("&") || /\band\b/.test(lower);
}

// Returns true if alt and primary share at least one name token (heuristic for "alt is a self-duplicate").
function shareNameTokens(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

function hasBackfillAccess(req: Request, url: URL): boolean {
  const providedSecret = req.headers.get("x-job-secret") ?? url.searchParams.get("secret");
  return Boolean(BACKFILL_SECRET && providedSecret && providedSecret === BACKFILL_SECRET);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!hasBackfillAccess(req, url)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connection();
  const apply = url.searchParams.get("apply") === "1";
  const modeParam = url.searchParams.get("mode");
  const mode: "fill" | "dedupe" | "refresh" | "clear-self-dupe" =
    modeParam === "refresh"
      ? "refresh"
      : modeParam === "dedupe"
        ? "dedupe"
        : modeParam === "clear-self-dupe"
          ? "clear-self-dupe"
          : "fill";

  // mode=clear-self-dupe: DB-only cleanup. Bypass portal fetch entirely.
  // Catches duplicate customer rows that have no portal_parent_id (otherwise filtered out).
  if (mode === "clear-self-dupe") {
    type Cand = {
      id: string;
      name: string;
      email: string;
      alternate_name: string | null;
      alternate_email: string | null;
      portal_parent_id: number | null;
    };
    const candidates = await sql<Cand[]>`
      SELECT id::text, name, email, alternate_name, alternate_email, portal_parent_id
      FROM customers
      WHERE (
        alternate_name IS NOT NULL
        AND LOWER(TRIM(alternate_name)) = LOWER(TRIM(name))
      ) OR (
        alternate_email IS NOT NULL
        AND LOWER(TRIM(alternate_email)) = LOWER(TRIM(email))
      )
    `;

    const planned = candidates.map(c => {
      const altNameMatchesPrimary =
        c.alternate_name !== null && norm(c.alternate_name) === norm(c.name);
      const altEmailMatchesPrimary =
        c.alternate_email !== null && norm(c.alternate_email) === norm(c.email);
      return {
        customerId: c.id,
        name: c.name,
        email: c.email,
        portalParentId: c.portal_parent_id,
        currentAltName: c.alternate_name,
        currentAltEmail: c.alternate_email,
        clearAltName: altNameMatchesPrimary,
        clearAltEmail: altEmailMatchesPrimary,
        newAltName: altNameMatchesPrimary ? null : c.alternate_name,
        newAltEmail: altEmailMatchesPrimary ? null : c.alternate_email,
      };
    });

    if (!apply) {
      return NextResponse.json({
        summary: {
          mode: "DRY RUN",
          strategy: "clear-self-dupe",
          totalCandidates: planned.length,
          wouldClearAltName: planned.filter(p => p.clearAltName).length,
          wouldClearAltEmail: planned.filter(p => p.clearAltEmail).length,
        },
        planned,
      });
    }

    for (const p of planned) {
      if (!p.clearAltName && !p.clearAltEmail) continue;
      await sql`
        UPDATE customers
        SET alternate_name  = ${p.newAltName},
            alternate_email = ${p.newAltEmail}
        WHERE id = ${p.customerId}::uuid
      `;
    }

    return NextResponse.json({
      summary: {
        mode: "APPLIED",
        strategy: "clear-self-dupe",
        totalCandidates: planned.length,
        clearedAltName: planned.filter(p => p.clearAltName).length,
        clearedAltEmail: planned.filter(p => p.clearAltEmail).length,
      },
      planned,
    });
  }
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : null;
  const customerIdParam = url.searchParams.get("customerId");

  const customers: CustomerRow[] = customerIdParam
    ? await sql<CustomerRow[]>`
        SELECT id::text, name, email, alternate_email, alternate_name, portal_parent_id
        FROM customers
        WHERE id = ${customerIdParam}::uuid
          AND portal_parent_id IS NOT NULL
      `
    : await sql<CustomerRow[]>`
        SELECT id::text, name, email, alternate_email, alternate_name, portal_parent_id
        FROM customers
        WHERE portal_parent_id IS NOT NULL
        ORDER BY portal_parent_id
        ${limit ? sql`LIMIT ${limit}` : sql``}
      `;

  const outcomes: Outcome[] = [];
  const BATCH = 10;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    const settled = await Promise.all(
      batch.map(async (c): Promise<Outcome> => {
        const familyId = Number(c.portal_parent_id);
        const fv = await fetchFamilyView(familyId);
        const parents = fv?.results?.parents ?? [];
        if (parents.length === 0) {
          return { kind: "skip_fetch_failed", customerId: c.id, familyId };
        }

        // Pick the co-parent: any parents[] row whose user_id != this customer's portal_parent_id.
        // Fall back to primary_ind=0 if user_id is missing.
        const coParent =
          parents.find(p => Number(p.user_id) !== familyId) ??
          parents.find(p => p.primary_ind === 0) ??
          null;

        const primaryEmail = norm(c.email);
        const primaryName = norm(c.name);
        const coEmail = norm(coParent?.email);
        const coName = norm(coParent?.name);

        // Self-loop detection: portal sometimes returns the same person as their own co-parent.
        const selfLoopReason: string | null =
          !coParent
            ? null
            : !coEmail && !coName
              ? "co-parent has no email or name"
              : coEmail && coEmail === primaryEmail
                ? "co-parent email matches primary email"
                : coName && coName === primaryName
                  ? "co-parent name matches primary name"
                  : null;

        if (mode === "fill") {
          if (!coParent) {
            return {
              kind: "skip_no_coparent",
              customerId: c.id,
              familyId,
              primaryName: c.name,
            };
          }
          if (selfLoopReason) {
            return {
              kind: "skip_self_loop",
              customerId: c.id,
              familyId,
              reason: selfLoopReason,
            };
          }

          // Only fill when current value is null. Never overwrite existing data.
          const newAltName = c.alternate_name === null && coParent.name ? coParent.name.trim() : null;
          const newAltEmail =
            c.alternate_email === null && coParent.email ? coParent.email.trim().toLowerCase() : null;

          if (!newAltName && !newAltEmail) {
            return { kind: "skip_already_set", customerId: c.id, familyId };
          }

          if (!apply) {
            return {
              kind: "would_update",
              customerId: c.id,
              familyId,
              primaryName: c.name,
              currentAltName: c.alternate_name,
              newAltName,
              currentAltEmail: c.alternate_email,
              newAltEmail,
            };
          }

          await sql`
            UPDATE customers
            SET
              alternate_name  = COALESCE(alternate_name,  ${newAltName}),
              alternate_email = COALESCE(alternate_email, ${newAltEmail})
            WHERE id = ${c.id}::uuid
          `;

          return {
            kind: "updated",
            customerId: c.id,
            familyId,
            primaryName: c.name,
            newAltName,
            newAltEmail,
          };
        }

        // mode === "dedupe" or "refresh"
        // Compute desired state. self-loop / no-coparent → null. Legit co-parent → portal values.
        const reason: "match" | "self_loop_clear" | "no_coparent_clear" =
          !coParent ? "no_coparent_clear" : selfLoopReason ? "self_loop_clear" : "match";

        // dedupe mode: only clear genuine self-duplicates. Preserve:
        //   - "match" reason (legit co-parent — never touch)
        //   - combined-edit alt names ("Dorothea & Ian", "X and Y")
        //   - no_coparent_clear with alt that shares ZERO tokens with primary (likely external co-parent
        //     not yet in portal; clearing would lose intentional manual data)
        if (mode === "dedupe") {
          if (reason === "match") {
            return { kind: "skip_already_correct", customerId: c.id, familyId };
          }
          if (looksLikeCombinedEdit(c.alternate_name)) {
            return { kind: "skip_already_correct", customerId: c.id, familyId };
          }
          if (
            reason === "no_coparent_clear" &&
            c.alternate_name &&
            !shareNameTokens(c.alternate_name, c.name)
          ) {
            return { kind: "skip_already_correct", customerId: c.id, familyId };
          }
        }

        const desiredAltName =
          reason === "match" && coParent?.name ? coParent.name.trim() : null;
        const desiredAltEmail =
          reason === "match" && coParent?.email ? coParent.email.trim().toLowerCase() : null;

        const currentAltNameNorm = norm(c.alternate_name) || null;
        const currentAltEmailNorm = norm(c.alternate_email) || null;
        const desiredAltNameNorm = norm(desiredAltName) || null;
        const desiredAltEmailNorm = norm(desiredAltEmail) || null;

        if (
          currentAltNameNorm === desiredAltNameNorm &&
          currentAltEmailNorm === desiredAltEmailNorm
        ) {
          return { kind: "skip_already_correct", customerId: c.id, familyId };
        }

        if (!apply) {
          return {
            kind: "would_refresh",
            customerId: c.id,
            familyId,
            primaryName: c.name,
            currentAltName: c.alternate_name,
            newAltName: desiredAltName,
            currentAltEmail: c.alternate_email,
            newAltEmail: desiredAltEmail,
            reason,
          };
        }

        await sql`
          UPDATE customers
          SET
            alternate_name  = ${desiredAltName},
            alternate_email = ${desiredAltEmail}
          WHERE id = ${c.id}::uuid
        `;

        return {
          kind: "refreshed",
          customerId: c.id,
          familyId,
          primaryName: c.name,
          newAltName: desiredAltName,
          newAltEmail: desiredAltEmail,
          reason,
        };
      }),
    );
    outcomes.push(...settled);
  }

  const wouldRefreshAll = outcomes.filter(o => o.kind === "would_refresh");
  const refreshedAll = outcomes.filter(o => o.kind === "refreshed");

  const summary = {
    mode: apply ? "APPLIED" : "DRY RUN",
    strategy: mode,
    totalCustomers: customers.length,
    // fill-mode counts
    wouldUpdate: outcomes.filter(o => o.kind === "would_update").length,
    updated: outcomes.filter(o => o.kind === "updated").length,
    skippedAlreadySet: outcomes.filter(o => o.kind === "skip_already_set").length,
    // refresh-mode counts
    wouldRefresh: wouldRefreshAll.length,
    wouldRefreshMatch: wouldRefreshAll.filter(o => o.reason === "match").length,
    wouldRefreshSelfLoopClear: wouldRefreshAll.filter(o => o.reason === "self_loop_clear").length,
    wouldRefreshNoCoparentClear: wouldRefreshAll.filter(o => o.reason === "no_coparent_clear").length,
    refreshed: refreshedAll.length,
    refreshedMatch: refreshedAll.filter(o => o.reason === "match").length,
    refreshedSelfLoopClear: refreshedAll.filter(o => o.reason === "self_loop_clear").length,
    refreshedNoCoparentClear: refreshedAll.filter(o => o.reason === "no_coparent_clear").length,
    skippedAlreadyCorrect: outcomes.filter(o => o.kind === "skip_already_correct").length,
    // shared
    skippedNoCoparent: outcomes.filter(o => o.kind === "skip_no_coparent").length,
    skippedSelfLoop: outcomes.filter(o => o.kind === "skip_self_loop").length,
    skippedFetchFailed: outcomes.filter(o => o.kind === "skip_fetch_failed").length,
  };

  return NextResponse.json({ summary, outcomes });
}
