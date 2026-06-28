// app/lib/zebra.ts
const ZEBRA_API_BASE = process.env.ZEBRA_API_BASE!;
const EMAIL = process.env.ZEBRA_EMAIL!;
const PASSWORD = process.env.ZEBRA_PASSWORD!;
const DEFAULT_BRANCH_ID = Number(process.env.ZEBRA_BRANCH_ID ?? 20);

type ReportEndpoint = "class" | "class-makeup";

let tokenCache: { token: string | null; exp: number } = { token: null, exp: 0 };

async function loginGetToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - now > 60) return tokenCache.token;

  const r = await fetch(`${ZEBRA_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/plain, */*" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    // no-store avoids caching auth responses
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Auth failed: ${r.status} ${text.slice(0, 300)}`);
  }

  let data: any = {};
  try { data = await r.json(); } catch { /* ignore */ }

  const token = data?.token || data?.accessToken || r.headers.get("x-auth-token");
  if (!token) throw new Error("Auth ok but no token returned");

  // cache ~50 minutes
  tokenCache = { token, exp: now + 50 * 60 };
  return token;
}

// The portal stamps writes with the acting admin's user id (`userid` in bodies).
// It lives in the JWT payload as `user.id` — decode it from the token we already
// hold rather than hardcoding it, with an env override as a fallback.
function decodePortalUserId(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const data = JSON.parse(json);
    const id = data?.user?.id ?? data?.id;
    return id != null ? Number(id) : null;
  } catch {
    return null;
  }
}

async function getPortalUserId(): Promise<number> {
  const envOverride = process.env.ZEBRA_USER_ID;
  if (envOverride) return Number(envOverride);
  const token = await loginGetToken();
  const fromToken = decodePortalUserId(token);
  if (fromToken == null) throw new Error("Could not determine portal user id (set ZEBRA_USER_ID)");
  return fromToken;
}

// Shared GET helper for the portal JSON API (same auth/headers as the readers).
async function portalGet<T>(path: string): Promise<T> {
  const token = await loginGetToken();
  const res = await fetch(`${ZEBRA_API_BASE}${path}`, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// Shared write helper (POST/PATCH) for the portal JSON API.
async function portalWrite<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  const token = await loginGetToken();
  const res = await fetch(`${ZEBRA_API_BASE}${path}`, {
    method,
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      "x-auth-token": token,
      origin: "https://portal.zebrarobotics.com",
      referer: "https://portal.zebrarobotics.com/",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await res.json().catch(() => undefined)) as T;
}

// ── Enrolment management (writes) ─────────────────────────────────────────────
//
// Endpoints reverse-engineered from the portal UI via DevTools. See the
// `portal-write-api-contract` memory for the full field mapping. These MUTATE
// the live portal — keep them behind manual dashboard actions, test on one
// throwaway enrolment first, and never call them from the automated scrape.

export type PortalStudentEnrolment = {
  student_batch_id: number;
  student_course_fee_id: number;
  course_id: number;
  course_name: string;
  sub_course_code: string | null;
  active_value?: string;
  active_id?: number;
  course_active_id: number; // 1 = active
  total_amount: string;
  enrolled_on?: string;
  batches: {
    batch_id: number;
    day?: string;
    start_time?: string;
    end_time?: string;
    enddate?: string | null;
    startdate?: string | null;
    active_id?: number;
    is_active?: number; // 1 = the student is currently active in this batch
  }[];
};

// Lists a student's current course enrolments (the source of student_batch_id
// for deactivation). Camps/schoolPrograms are returned by the portal too but
// omitted here — this drives the "mark inactive" picker for classes.
export async function fetchStudentEnrolments(studentId: number): Promise<PortalStudentEnrolment[]> {
  const data = await portalGet<{ classes?: PortalStudentEnrolment[] }>(
    `/family-view/student-courses-details/${studentId}`,
  );
  return Array.isArray(data?.classes) ? data.classes : [];
}

type PortalBatchDetail = {
  student_batch_id: number;
  startdate: string;
  branch_course_fee_id: number;
  course_id: number;
  sub_course_id: number;
  student_course_fee_id: number;
  recurring_payment_type: string;
  total_amount: string;
  notes: string | null;
  batches: { batch_id: number; active_id?: number; enddate?: string | null; instructor_user_id?: number | null }[];
};

// Reads the full edit-form state for a single enrolment — every field the PATCH
// must echo back, and the exact course/level/fee used when inheriting an
// enrolment onto a new session. Keyed by student_batch_id.
export async function fetchStudentBatchDetail(studentBatchId: number): Promise<PortalBatchDetail> {
  const data = await portalGet<{ results?: PortalBatchDetail[] }>(
    `/family-view/student-batch-details/${studentBatchId}`,
  );
  const detail = data?.results?.[0];
  if (!detail) throw new Error(`No batch details for student_batch_id ${studentBatchId}`);
  return detail;
}

// Marks one course enrolment inactive. Mirrors the portal's own edit flow:
// read the current enrolment, echo every field back, flip activeId -> "0" and
// stamp a completion date. studentId is required because the detail endpoint
// does not return it (get it from fetchStudentEnrolments / the caller).
export async function setEnrolmentInactive(opts: {
  studentId: number;
  studentBatchId: number;
  completionDate?: string; // "YYYY-MM-DD"; defaults to today
}): Promise<void> {
  const { studentId, studentBatchId } = opts;
  const completionDate = opts.completionDate ?? ymdToday();
  const detail = await fetchStudentBatchDetail(studentBatchId);
  const userid = await getPortalUserId();

  const batchIds = detail.batches.map((b) => b.batch_id);
  const coachIds: Record<string, number | null> = {};
  for (const b of detail.batches) coachIds[String(b.batch_id)] = b.instructor_user_id ?? null;

  const body = {
    student_id: String(studentId),
    fee_id: detail.branch_course_fee_id,
    price: detail.total_amount,
    priceChange: false,
    batches: batchIds,
    removedBatches: [] as number[],
    addedBatches: [] as number[],
    start_date_changed: 0,
    course: detail.course_id,
    branch: DEFAULT_BRANCH_ID,
    comment: "",
    startdate: detail.startdate,
    userid,
    student_course_fee_id: detail.student_course_fee_id,
    activeId: "0",
    completionDate,
    coachIds,
    coachesChange: false,
    subCourseChange: false,
    recurring_payment_type: detail.recurring_payment_type,
    sub_course_id: detail.sub_course_id,
  };

  await portalWrite("PATCH", `/students/batch/${studentBatchId}`, body);
}

export type PortalProgram = {
  id: number; // course id
  name: string;
  course_code: string;
  total_level: number;
  fees: number[];
  subCourses?: { sub_course_id: number; sub_course_code: string; sub_course_name: string; sub_course_order_num: number }[];
};

// Catalogue of programs (courses) + their levels (sub-courses) for a branch.
export async function fetchPrograms(branchId: number = DEFAULT_BRANCH_ID): Promise<PortalProgram[]> {
  const data = await portalGet<{ results?: PortalProgram[] }>(
    `/portal-programs/?branch_id=${branchId}&type=programs&include_comp=true`,
  );
  return Array.isArray(data?.results) ? data.results : [];
}

export type PortalCourseBatch = {
  batch_id: number;
  day: string;
  start_time: string;
  end_time: string;
  batch_full_ind: number;
  enrolled_student_count: number;
  maximum_student: number;
  course_name: string;
  course_code: string;
};

// Scheduled class instances (batches) available for a given course at a branch.
export async function fetchCourseBatches(
  courseId: number,
  branchId: number = DEFAULT_BRANCH_ID,
): Promise<PortalCourseBatch[]> {
  const data = await portalGet<{ results?: PortalCourseBatch[] }>(
    `/portal-programs/${courseId}?branchId=${branchId}`,
  );
  return Array.isArray(data?.results) ? data.results : [];
}

export type PortalCourseFee = {
  branch_course_fee_id: number;
  course_fee: number;
  frequency_nbr: number;
  frequency_unit: string;
  batch_type_value: string;
  delivery_type_id: number;
};

export type PortalCourseDetail = {
  course_name: string;
  course_active_id: number;
  active_value: string;
  active_id: number;
  fees?: PortalCourseFee[];
};

// Full course metadata from course-detail endpoint, including active flags.
export async function fetchCourseDetail(
  courseId: number,
  branchId: number = DEFAULT_BRANCH_ID,
): Promise<PortalCourseDetail> {
  return await portalGet<PortalCourseDetail>(
    `/programs/course-detail/${courseId}?branchId=${branchId}&show_all=true`,
  );
}

// Fee options for a course at a branch — source of fee_id + price for an add.
export async function fetchCourseFees(
  courseId: number,
  branchId: number = DEFAULT_BRANCH_ID,
): Promise<PortalCourseFee[]> {
  const data = await fetchCourseDetail(courseId, branchId);
  return Array.isArray(data?.fees) ? data.fees : [];
}

// Creates a new course enrolment for a student. The caller resolves course /
// sub_course / batch / fee ids from the catalogue helpers above.
export async function createEnrolment(opts: {
  studentId: number;
  courseId: number;
  subCourseId: number;
  batchId: number;
  feeId: number; // branch_course_fee_id
  price: number; // course_fee
  startDate: string; // "YYYY-MM-DD"
  recurringPaymentType?: string; // e.g. "Credit Card"
  branchId?: number;
}): Promise<void> {
  const userid = await getPortalUserId();
  const body = {
    student_id: String(opts.studentId),
    fee_id: opts.feeId,
    price: opts.price,
    batches: [opts.batchId],
    course: opts.courseId,
    branch: opts.branchId ?? DEFAULT_BRANCH_ID,
    comment: "",
    startdate: opts.startDate,
    userid,
    activeId: 1,
    completionDate: "",
    coachIds: {} as Record<string, number | null>,
    recurring_payment_type: opts.recurringPaymentType ?? "Credit Card",
    sub_course_id: opts.subCourseId,
  };
  await portalWrite("POST", `/students/batch`, body);
}

function ymdToday(): string {
  const d = new Date();
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function fetchEnrolmentReportJSON(options: {
  endpoint: ReportEndpoint; // "class" | "class-makeup"
  branchId: number;
  activeId: number;         // 1 = All usually
  day: string;              // "All" | "Monday" etc.
  fromDate?: string;        // "YYYY-MM-DD" when activeId != 1
  toDate?: string;
}) {
  const token = await loginGetToken();

  const { endpoint, branchId, activeId, day, fromDate, toDate } = options;
  let path = `${endpoint}/${branchId}/default/default/${activeId}/${day}`;
  if (String(activeId) !== "1" && fromDate && toDate) path += `/${fromDate}/${toDate}`;

  const url = `${ZEBRA_API_BASE}/reports/${path}`;
  const r = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Report error ${r.status}: ${text.slice(0, 300)}`);
  }

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await r.text();
    throw new Error(`Expected JSON, got ${ct}: ${text.slice(0, 200)}`);
  }

  const data = await r.json();
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as any).results)) return (data as any).results;
  return data ? [data] : [];
}

// scraper_helpers.ts
export async function fetchAttendanceReport(opts: {
  startDate: string;     // "YYYY-MM-DD"
  endDate: string;       // "YYYY-MM-DD"
  branchId: number; // 20
}) {
  const {startDate, endDate, branchId} = opts;
  console.log(opts);

  const token = await loginGetToken();

  const url = `${ZEBRA_API_BASE}/reports/9210/batches/attendance?startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}&studentId=&branch_id=${encodeURIComponent(
    String(branchId)
  )}`;

  console.log(url);

  const res = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });


  if (!res.ok) {
    throw new Error(`Attendance fetch failed: ${res.status} ${res.statusText}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON, got ${ct}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(data);

  if (Array.isArray(data)) return data;

 
  if (data && typeof data === "object" && Array.isArray((data as any).results)) return (data as any).results;

  return data ? [data] : [];

}

// family-view endpoint — returns parents[], students[], user[] for a family.
// `familyId` matches customers.portal_parent_id (same ID space as class report parent_id).
export type FamilyViewParent = {
  user_id: number;
  name: string;
  email: string;
  alternate_email: string;
  primary_ind: 0 | 1;
  active_id: number;
  address?: string;
  mobile?: string;
  homephone?: string;
};

export type FamilyViewStudent = {
  user_id: number;
  name: string;
  active_id: number;
  dob?: string;
  gender?: string;
};

export type FamilyViewResponse = {
  results?: {
    parents?: FamilyViewParent[];
    students?: FamilyViewStudent[];
    user?: FamilyViewParent[];
  };
};

export async function fetchFamilyView(familyId: number): Promise<FamilyViewResponse | null> {
  const token = await loginGetToken();

  const url = `${ZEBRA_API_BASE}/family-view/family/${familyId}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return (await res.json().catch(() => null)) as FamilyViewResponse | null;
}

export async function fetchCampEnrolments(opts: {
  startDate: string;     // "YYYY-MM-DD"
  endDate: string;       // "YYYY-MM-DD"
  branchId: number; // 20
}) {
  const {startDate, endDate, branchId} = opts;
  console.log(opts);
  const token = await loginGetToken();

  const url = `${ZEBRA_API_BASE}/reports/camp/20/default/default/${startDate}/${endDate}`;
  console.log(url);
  const res = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "x-auth-token": token,
      referer: "https://portal.zebrarobotics.com/",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Camp enrolments fetch failed: ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON, got ${ct}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(data);

  if (Array.isArray(data)) return data;

 
  if (data && typeof data === "object" && Array.isArray((data as any).results)) return (data as any).results;

  return data ? [data] : [];

}

// ── Attendance marking (writes) ───────────────────────────────────────────────
//
// POST /batches/attendance records attendance for one batch on one date. The
// payload mirrors the portal UI's own save (captured via DevTools). The status
// (Present / Absent / etc.) is carried by `attendance_id` — it is the id of the
// attendance-value lookup, NOT a per-student record id. Values below are the
// branch's lookup ids, confirmed against the portal's status dropdown.
//
// Like the enrolment writes above, this MUTATES the live portal — keep it behind
// manual dashboard actions and never call it from the automated scrape.

export const ATTENDANCE_STATUS = {
  Present: 2660,
  "Vacation Leave": 2661,
  "Sick Leave": 2662,
  "Emergency Leave": 2663,
  Absent: 2664,
  Unmarked: 2665,
} as const;

export type AttendanceStatus = keyof typeof ATTENDANCE_STATUS;

// role_id the portal stamps on student attendance rows (6 = Student).
const ATTENDANCE_STUDENT_ROLE_ID = 6;

// Normalize a clock time to the portal's "HH:MM:SS" form. Accepts "9:30",
// "09:30", "09:30:00" (and is forgiving of stray whitespace).
function normalizeTime(t: string): string {
  const parts = t.trim().split(":");
  if (parts.length < 2) throw new Error(`Unrecognized time: "${t}"`);
  const [h, m, s = "0"] = parts;
  const pad2 = (n: string) => n.padStart(2, "0");
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export type AttendanceBatchMatch = {
  batchId: number;
  courseId: number;
  courseName: string;
  day: string;
  startTime: string;
  endTime: string | null;
  enrolment: PortalStudentEnrolment;
};

// Resolves which batch an attendance mark applies to, by matching a day + time
// against the student's current enrolments. This is the "look at all their
// active enrolments and match to one" step: a student can be in several batches,
// and the attendance POST is keyed by batch_id, so we pick the batch whose
// day/start_time (and end_time, if supplied) line up with the slot being marked.
//
// Prefers batches the student is still active in (is_active === 1); dedupes by
// batch_id (the same batch can appear under multiple student_batch rows). Throws
// a descriptive error if nothing matches, or if the slot is genuinely ambiguous
// (two different batches share the same day/time).
export async function findEnrolmentBatchForSlot(
  studentId: number,
  day: string,
  startTime: string,
  endTime?: string,
): Promise<AttendanceBatchMatch> {
  const enrolments = await fetchStudentEnrolments(studentId);
  const wantDay = day.trim().toLowerCase();
  const wantStart = normalizeTime(startTime);
  const wantEnd = endTime ? normalizeTime(endTime) : null;

  type Cand = AttendanceBatchMatch & { active: boolean };
  const candidates: Cand[] = [];

  for (const enr of enrolments) {
    for (const b of enr.batches ?? []) {
      if (!b.day || !b.start_time) continue;
      if (b.day.trim().toLowerCase() !== wantDay) continue;
      if (normalizeTime(b.start_time) !== wantStart) continue;
      if (wantEnd && b.end_time && normalizeTime(b.end_time) !== wantEnd) continue;
      candidates.push({
        batchId: b.batch_id,
        courseId: enr.course_id,
        courseName: enr.course_name,
        day: b.day,
        startTime: b.start_time,
        endTime: b.end_time ?? null,
        enrolment: enr,
        active: b.is_active === 1,
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `No enrolment for student ${studentId} matches ${day} ${wantStart}` +
        (wantEnd ? `-${wantEnd}` : ""),
    );
  }

  // Prefer batches the student is still active in, then collapse duplicates that
  // resolve to the same batch_id (same class under multiple enrolment rows).
  const active = candidates.filter((c) => c.active);
  const pool = active.length ? active : candidates;
  const distinct = [...new Map(pool.map((c) => [c.batchId, c])).values()];

  if (distinct.length > 1) {
    throw new Error(
      `Ambiguous attendance slot for student ${studentId} on ${day} ${wantStart}: ` +
        `matches batches ${distinct.map((c) => c.batchId).join(", ")}. Pass endTime to disambiguate.`,
    );
  }

  return distinct[0];
}

// Cached student_id -> {firstName,lastName} map, built from the branch-wide class
// report (the only readily-available source that pairs student_id with a name).
// The portal stores first/last separately but the report combines them, so we
// split on the first space: first token = first name, remainder = last name.
let studentNameCache: { map: Map<number, { firstName: string; lastName: string }>; exp: number } = {
  map: new Map(),
  exp: 0,
};

async function getStudentNameMap(
  branchId: number = DEFAULT_BRANCH_ID,
): Promise<Map<number, { firstName: string; lastName: string }>> {
  const now = Date.now();
  if (studentNameCache.map.size && studentNameCache.exp > now) return studentNameCache.map;

  const rows = await fetchEnrolmentReportJSON({
    endpoint: "class",
    branchId,
    activeId: 1,
    day: "All",
  });

  const map = new Map<number, { firstName: string; lastName: string }>();
  for (const r of rows as any[]) {
    const id = Number(r?.student_id);
    const full = String(r?.student_name ?? "").trim();
    if (!id || !full || map.has(id)) continue;
    const sp = full.indexOf(" ");
    const firstName = sp === -1 ? full : full.slice(0, sp);
    const lastName = sp === -1 ? "" : full.slice(sp + 1).trim();
    map.set(id, { firstName, lastName });
  }

  studentNameCache = { map, exp: now + 10 * 60 * 1000 }; // 10 min
  return map;
}

// Best-effort first/last name for a student id, used to populate the attendance
// payload when the caller hasn't supplied a name. Returns null if not found.
export async function resolveStudentName(
  studentId: number,
  branchId: number = DEFAULT_BRANCH_ID,
): Promise<{ firstName: string; lastName: string } | null> {
  const map = await getStudentNameMap(branchId);
  return map.get(studentId) ?? null;
}

export type AttendanceStudentEntry = {
  user_id: number;
  role_id: number;
  first_name: string;
  last_name: string;
  attendance_id: number; // status code (see ATTENDANCE_STATUS)
  modified_on: string;
  makeup: boolean;
};

// Low-level write: records the given student_list for one batch on one date.
// Mirrors the portal's own POST exactly. The portal sends the whole roster in
// one call; this helper accepts any subset so callers can mark one student or
// many. Prefer markStudentAttendance for the common single-student case.
export async function postBatchAttendance(opts: {
  batchId: number;
  date: string; // "YYYY-MM-DD"
  students: AttendanceStudentEntry[];
  comment?: string;
  attendanceWeekId?: number | null;
}): Promise<void> {
  const modifiedBy = await getPortalUserId();
  const body = {
    attendance_week_id: opts.attendanceWeekId ?? null,
    comment: opts.comment ?? "",
    attendance_date: opts.date,
    batch_id: opts.batchId,
    modified_by: modifiedBy,
    student_list: opts.students,
  };
  await portalWrite("POST", `/batches/attendance`, body);
}

// One-call attendance mark: given a student + the slot's day/time + the date +
// makeup flag + status, resolve the batch from the student's enrolments and POST.
// first/last name are optional — supply them when you already have them (e.g. the
// roster row being clicked) to skip the name lookup; otherwise they're resolved
// from the class report.
export async function markStudentAttendance(opts: {
  studentId: number;
  day: string;
  startTime: string;
  endTime?: string;
  date: string; // "YYYY-MM-DD"
  makeup: boolean;
  status: AttendanceStatus;
  firstName?: string;
  lastName?: string;
  comment?: string;
  roleId?: number;
}): Promise<{ batchId: number; courseName: string }> {
  const match = await findEnrolmentBatchForSlot(
    opts.studentId,
    opts.day,
    opts.startTime,
    opts.endTime,
  );

  let firstName = opts.firstName;
  let lastName = opts.lastName;
  if (firstName == null || lastName == null) {
    const resolved = await resolveStudentName(opts.studentId);
    if (!resolved) {
      throw new Error(
        `Could not resolve name for student ${opts.studentId}; pass firstName/lastName explicitly.`,
      );
    }
    firstName = firstName ?? resolved.firstName;
    lastName = lastName ?? resolved.lastName;
  }

  await postBatchAttendance({
    batchId: match.batchId,
    date: opts.date,
    comment: opts.comment,
    students: [
      {
        user_id: opts.studentId,
        role_id: opts.roleId ?? ATTENDANCE_STUDENT_ROLE_ID,
        first_name: firstName,
        last_name: lastName,
        attendance_id: ATTENDANCE_STATUS[opts.status],
        modified_on: new Date().toISOString(),
        makeup: opts.makeup,
      },
    ],
  });

  return { batchId: match.batchId, courseName: match.courseName };
}