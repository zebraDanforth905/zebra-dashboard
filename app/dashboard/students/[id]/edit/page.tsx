import Link from "next/link";
import clsx from "clsx";
import Search from "@/app/ui/search";
import { fetchStudentName, fetchStudentsForAssignment } from "@/app/lib/data";
import { fetchStudentEnrolments, type PortalStudentEnrolment } from "@/app/lib/scraper_helpers";
import { listPendingInactivations } from "@/app/lib/inactivation-actions";
import StudentEnrolments, { type EnrolmentView } from "@/app/ui/students/student-enrolments";

// A portal enrolment is "current" when the course is active and at least one of
// its batches has not yet ended (mirrors isCurrentPortalEnrolment in actions.ts).
function isCurrentEnrolment(e: PortalStudentEnrolment): boolean {
  if (e.course_active_id !== 1) return false;
  const now = Date.now();
  return (e.batches ?? []).some((b) => {
    if (!b.enddate) return true;
    const t = new Date(b.enddate).getTime();
    return Number.isFinite(t) && t >= now;
  });
}

function toView(e: PortalStudentEnrolment, isCurrent: boolean): EnrolmentView {
  const b = (e.batches ?? [])[0] ?? null;
  return {
    studentBatchId: e.student_batch_id,
    courseName: e.course_name,
    subCourseCode: e.sub_course_code ?? null,
    totalAmount: e.total_amount,
    enrolledOn: e.enrolled_on ?? null,
    isCurrent,
    batch: b
      ? {
          batchId: b.batch_id,
          day: b.day ?? "",
          startTime: b.start_time ?? "",
          endTime: b.end_time ?? "",
          endDate: b.enddate ?? null,
        }
      : null,
  };
}

export default async function Page(props: {
  searchParams?: Promise<{ query?: string; page?: string }>;
  params: Promise<{ id: string }>;
}) {
  const searchParams = await props.searchParams;
  const query = searchParams?.query || "";
  const id = (await props.params)?.id;

  const [student, navStudents, enrolments, pendingInactivations] = await Promise.all([
    fetchStudentName(id),
    fetchStudentsForAssignment(query),
    fetchStudentEnrolments(Number(id)).catch((e) => {
      console.error("Failed to load portal enrolments:", e);
      return [] as PortalStudentEnrolment[];
    }),
    listPendingInactivations(Number(id)).catch((e) => {
      console.error("Failed to load pending inactivations:", e);
      return [] as Awaited<ReturnType<typeof listPendingInactivations>>;
    }),
  ]);

  const pendingByBatch: Record<number, string> = {};
  for (const p of pendingInactivations) pendingByBatch[p.studentBatchId] = p.endDate;

  const current = enrolments.filter(isCurrentEnrolment).map((e) => toView(e, true));
  const past = enrolments.filter((e) => !isCurrentEnrolment(e)).map((e) => toView(e, false));

  return (
    <div className="m-6 flex flex-col gap-6 md:flex-row">
      {/* Left: quick-nav search */}
      <aside className="w-full shrink-0 md:w-72">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Students</h2>
        <Search placeholder="Search students..." />
        <nav className="mt-3 max-h-[calc(100vh-220px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
          {navStudents.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No students found.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {navStudents.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/students/${s.id}/edit`}
                    className={clsx(
                      "block px-4 py-2.5 text-sm transition-colors hover:bg-slate-50",
                      String(s.id) === String(id)
                        ? "bg-blue-50 font-semibold text-blue-700"
                        : "text-slate-700",
                    )}
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      {/* Right: student detail */}
      <main className="min-w-0 flex-1">
        <div className="flex w-full items-center justify-between">
          <div>
            <h1 className="text-2xl text-slate-900">{student?.name ?? `Student ${id}`}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Student ID: {id}
              {student?.customer_name ? ` · ${student.customer_name}` : ""}
            </p>
          </div>
        </div>

        <StudentEnrolments
          studentId={id}
          studentName={student?.name ?? ""}
          current={current}
          past={past}
          pendingInactivations={pendingByBatch}
        />
      </main>
    </div>
  );
}
