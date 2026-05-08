// Temporary probe route. Hit /jobs/probe-portal locally to discover
// portal endpoints that may expose alternate parent names.
// DELETE before merging to master.

import { NextResponse } from "next/server";
import { connection } from "next/server";

const ZEBRA_API_BASE = process.env.ZEBRA_API_BASE!;
const EMAIL = process.env.ZEBRA_EMAIL!;
const PASSWORD = process.env.ZEBRA_PASSWORD!;

async function login(): Promise<string> {
  const r = await fetch(`${ZEBRA_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Auth failed: ${r.status}`);
  const data = await r.json().catch(() => ({}));
  return data?.token || data?.accessToken || r.headers.get("x-auth-token") || "";
}

async function tryEndpoint(token: string, path: string) {
  const url = `${ZEBRA_API_BASE}${path}`;
  try {
    const r = await fetch(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "x-auth-token": token,
        referer: "https://portal.zebrarobotics.com/",
      },
      cache: "no-store",
    });
    const ct = r.headers.get("content-type") || "";
    let body: any = null;
    if (ct.includes("application/json")) {
      body = await r.json().catch(() => null);
    } else {
      body = (await r.text()).slice(0, 200);
    }
    const sample = Array.isArray(body) ? body[0] : body;
    const keys = sample && typeof sample === "object" ? Object.keys(sample) : [];
    return { path, status: r.status, ok: r.ok, contentType: ct, keys, sample };
  } catch (e: any) {
    return { path, error: String(e?.message ?? e) };
  }
}

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId") || "1";
  const studentId = url.searchParams.get("studentId") || "1";
  const customerId = url.searchParams.get("customerId") || parentId;
  const branchId = url.searchParams.get("branchId") || "20";

  const token = await login();

  // ── Dump raw keys from the existing class report scrape ────────────────────
  const classRaw = await fetch(
    `${ZEBRA_API_BASE}/reports/class/${branchId}/default/default/1/All`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "x-auth-token": token,
        referer: "https://portal.zebrarobotics.com/",
      },
      cache: "no-store",
    },
  );
  let classRowKeys: string[] = [];
  let classRowSample: any = null;
  let classAltFields: Record<string, any> = {};
  if (classRaw.ok) {
    const json = await classRaw.json().catch(() => null);
    const rows = Array.isArray(json)
      ? json
      : Array.isArray(json?.results)
        ? json.results
        : [];
    if (rows.length > 0) {
      classRowKeys = Object.keys(rows[0] ?? {});
      classRowSample = rows[0];
      // Surface any field that looks parent/guardian/alternate-related
      for (const k of classRowKeys) {
        if (/alt|parent|guardian|contact|secondary|spouse|emergency/i.test(k)) {
          classAltFields[k] = (rows[0] as any)[k];
        }
      }
    }
  }

  // Confirmed real endpoint from devtools: /family-view/family/{familyId}
  // Also probe sibling shapes under the same prefix.
  const candidates = [
    `/family-view/family/15297`,           // known good ID from devtools
    `/family-view/family/${parentId}`,     // try with parent_id from class report
    `/family-view/family/${customerId}`,
    `/family-view/students/${studentId}`,
    `/family-view/parents/${parentId}`,
    `/family-view/parent/${parentId}`,
    `/family-view/family/${parentId}/parents`,
    `/family-view/family/${parentId}/students`,
    `/parents/${parentId}`,
    `/parent/${parentId}`,
    `/customers/${customerId}`,
    `/customer/${customerId}`,
    `/users/${parentId}`,
    `/user/${parentId}`,
    `/students/${studentId}`,
    `/student/${studentId}`,
    `/students/${studentId}/parents`,
    `/students/${studentId}/guardians`,
    `/students/${studentId}/contacts`,
    `/parents/${parentId}/contacts`,
    `/parents/${parentId}/emergency-contacts`,
    `/family/${parentId}`,
    `/families/${parentId}`,
    `/branches/${branchId}/parents/${parentId}`,
    `/reports/parents`,
    `/reports/customers`,
    `/reports/family/${branchId}/default/default/${parentId}`,
  ];

  const results = [];
  for (const path of candidates) {
    results.push(await tryEndpoint(token, path));
  }

  return NextResponse.json(
    {
      classReport: {
        rowKeys: classRowKeys,
        suspiciousFields: classAltFields,
        sample: classRowSample,
      },
      probed: results.length,
      results,
    },
    { headers: {} },
  );
}
