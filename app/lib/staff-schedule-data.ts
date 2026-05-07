import postgres from 'postgres';
import {
	STAFF_SCHEDULE_WEEKDAYS,
	StaffScheduleAbsence,
	StaffScheduleAssignedStaff,
	StaffScheduleClassBlock,
	StaffScheduleCourseOption,
	StaffScheduleDailyShift,
	StaffScheduleFutureOverview,
	StaffScheduleFutureWarning,
	StaffScheduleOpenShift,
	StaffScheduleQualification,
	StaffSchedulePickupCoverageWarning,
	StaffSchedulePickupCoverageRow,
	StaffScheduleWarningSuggestion,
	StaffScheduleTemplate,
	StaffScheduleTemplateDateRange,
	StaffScheduleTemplateShift,
	StaffScheduleTemplateViewData,
	StaffScheduleUntemplatedShift,
	StaffScheduleUser,
	StaffScheduleWeekday,
	StaffScheduleWeeklyDay,
	StaffAvailabilityBlock,
	StaffPersonalScheduleDay,
} from './staff-schedule-types';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function toIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function toWeekStart(input?: string): Date {
	const base = input ? new Date(`${input}T00:00:00`) : new Date();
	const d = new Date(base);
	d.setHours(0, 0, 0, 0);
	const day = d.getDay();
	const mondayDelta = (day + 6) % 7;
	d.setDate(d.getDate() - mondayDelta);
	return d;
}

function weekdayForDate(date: Date): StaffScheduleWeekday {
	const jsDay = date.getDay();
	const mapped = (jsDay + 6) % 7;
	return STAFF_SCHEDULE_WEEKDAYS[mapped];
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
	return startA < endB && endA > startB;
}

function effectiveAbsenceWindowForDate(absence: StaffScheduleAbsence, date: string): { start: string; end: string } | null {
	if (date < absence.start_date || date > absence.end_date) return null;

	if (absence.start_date === absence.end_date) {
		return { start: absence.start_time, end: absence.end_time };
	}
	if (date === absence.start_date) {
		return { start: absence.start_time, end: '23:59:59' };
	}
	if (date === absence.end_date) {
		return { start: '00:00:00', end: absence.end_time };
	}

	return { start: '00:00:00', end: '23:59:59' };
}

function intersectTimeRanges(
	aStart: string,
	aEnd: string,
	bStart: string,
	bEnd: string,
): { start: string; end: string } | null {
	const start = aStart > bStart ? aStart : bStart;
	const end = aEnd < bEnd ? aEnd : bEnd;
	return start < end ? { start, end } : null;
}

function mergeRanges(ranges: Array<{ start: string; end: string }>): Array<{ start: string; end: string }> {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
	const merged: Array<{ start: string; end: string }> = [sorted[0]];

	for (let i = 1; i < sorted.length; i += 1) {
		const current = sorted[i];
		const last = merged[merged.length - 1];
		if (current.start <= last.end) {
			if (current.end > last.end) {
				last.end = current.end;
			}
		} else {
			merged.push(current);
		}
	}

	return merged;
}

function normalizeShiftTypes(input: unknown): string[] {
	if (!Array.isArray(input)) return [];
	return input.map((v) => String(v)).filter((v) => v.length > 0);
}

export function getWeekDateRange(weekStartInput?: string): {
	weekStart: string;
	weekEnd: string;
	days: Array<{ date: string; weekday: StaffScheduleWeekday }>;
} {
	const weekStartDate = toWeekStart(weekStartInput);
	const days: Array<{ date: string; weekday: StaffScheduleWeekday }> = [];
	for (let i = 0; i < 7; i += 1) {
		const d = new Date(weekStartDate);
		d.setDate(d.getDate() + i);
		days.push({ date: toIsoDate(d), weekday: weekdayForDate(d) });
	}

	const weekEndDate = new Date(weekStartDate);
	weekEndDate.setDate(weekEndDate.getDate() + 6);

	return {
		weekStart: toIsoDate(weekStartDate),
		weekEnd: toIsoDate(weekEndDate),
		days,
	};
}

function buildDateRangeDays(startDate: string, endDate: string): Array<{ date: string; weekday: StaffScheduleWeekday }> {
	const start = new Date(`${startDate}T00:00:00`);
	const end = new Date(`${endDate}T00:00:00`);
	const days: Array<{ date: string; weekday: StaffScheduleWeekday }> = [];
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		days.push({
			date: toIsoDate(d),
			weekday: weekdayForDate(d),
		});
	}
	return days;
}

function monthDateRange(monthInput?: string): { selectedMonth: string; fromDate: string; throughDate: string } {
	const now = new Date();
	const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const selectedMonth = /^\d{4}-\d{2}$/.test(monthInput || '') ? String(monthInput) : fallbackMonth;
	const [yearText, monthText] = selectedMonth.split('-');
	const year = Number(yearText);
	const monthIndex = Number(monthText) - 1;
	const start = new Date(year, monthIndex, 1);
	const end = new Date(year, monthIndex + 1, 0);
	return {
		selectedMonth,
		fromDate: toIsoDate(start),
		throughDate: toIsoDate(end),
	};
}

export async function fetchStaffScheduleUsers(): Promise<StaffScheduleUser[]> {
	const rows = await sql<StaffScheduleUser[]>`
		SELECT
			u.id::text AS id,
			u.name,
			COALESCE(u.coach_capacity, 6)::int AS coach_capacity
		FROM users u
		ORDER BY u.name ASC
	`;
	return rows;
}

export async function fetchStaffScheduleCourseOptions(): Promise<StaffScheduleCourseOption[]> {
	const rows = await sql<StaffScheduleCourseOption[]>`
		SELECT c.id::text AS id, c.name
		FROM courses c
		ORDER BY c.name ASC
	`;
	return rows;
}

export async function fetchStaffScheduleQualifications(): Promise<StaffScheduleQualification[]> {
	const rows = await sql<StaffScheduleQualification[]>`
		SELECT
			sq.id,
			sq.user_id::text AS user_id,
			u.name AS user_name,
			sq.course_id::text AS course_id,
			c.name AS course_name
		FROM staff_qualification sq
		JOIN users u ON u.id::text = sq.user_id::text
		JOIN courses c ON c.id::text = sq.course_id::text
		ORDER BY u.name ASC, c.name ASC
	`;
	return rows;
}

export async function fetchStaffScheduleAbsences(weekStartInput?: string): Promise<StaffScheduleAbsence[]> {
	const { weekStart, weekEnd } = getWeekDateRange(weekStartInput);
	return fetchStaffScheduleAbsencesForDateRange(weekStart, weekEnd);
}

async function fetchStaffScheduleAbsencesForDateRange(startDate: string, endDate: string): Promise<StaffScheduleAbsence[]> {
	const rows = await sql<StaffScheduleAbsence[]>`
		SELECT
			a.id,
			a.user_id::text AS user_id,
			u.name AS user_name,
			a.start_date::text AS start_date,
			a.end_date::text AS end_date,
			a.start_time::text AS start_time,
			a.end_time::text AS end_time,
			COALESCE(a.status, 'approved')::text AS status,
			a.note::text AS note
		FROM staff_absence a
		JOIN users u ON u.id::text = a.user_id::text
		WHERE a.start_date <= ${endDate}::date
			AND a.end_date >= ${startDate}::date
		ORDER BY a.start_date ASC, a.start_time ASC
	`;
	return rows;
}

export async function fetchPendingStaffAbsenceRequests(fromDateInput?: string, throughDateInput?: string): Promise<StaffScheduleAbsence[]> {
	const hasDateRange = Boolean(fromDateInput && throughDateInput);
	const fromDate = fromDateInput || toIsoDate(new Date());
	const throughDate = throughDateInput || fromDate;

	if (!hasDateRange) {
		const rows = await sql<StaffScheduleAbsence[]>`
			SELECT
				a.id,
				a.user_id::text AS user_id,
				u.name AS user_name,
				a.start_date::text AS start_date,
				a.end_date::text AS end_date,
				a.start_time::text AS start_time,
				a.end_time::text AS end_time,
				COALESCE(a.status, 'approved')::text AS status,
				a.note::text AS note
			FROM staff_absence a
			JOIN users u ON u.id::text = a.user_id::text
			WHERE COALESCE(a.status, 'approved') = 'requested'
			ORDER BY a.start_date ASC, a.start_time ASC
		`;
		return rows;
	}

	const rows = await sql<StaffScheduleAbsence[]>`
		SELECT
			a.id,
			a.user_id::text AS user_id,
			u.name AS user_name,
			a.start_date::text AS start_date,
			a.end_date::text AS end_date,
			a.start_time::text AS start_time,
			a.end_time::text AS end_time,
			COALESCE(a.status, 'approved')::text AS status,
			a.note::text AS note
		FROM staff_absence a
		JOIN users u ON u.id::text = a.user_id::text
		WHERE COALESCE(a.status, 'approved') = 'requested'
			AND a.start_date <= ${throughDate}::date
			AND a.end_date >= ${fromDate}::date
		ORDER BY a.start_date ASC, a.start_time ASC
	`;
	return rows;
}

export async function fetchStaffAvailability(userId: string): Promise<StaffAvailabilityBlock[]> {
	const rows = await sql<StaffAvailabilityBlock[]>`
		SELECT
			id,
			user_id::text AS user_id,
			INITCAP(weekday) AS weekday,
			start_time::text AS start_time,
			end_time::text AS end_time
		FROM staff_availability
		WHERE user_id::text = ${userId}
		ORDER BY
			CASE LOWER(weekday)
				WHEN 'monday' THEN 1
				WHEN 'tuesday' THEN 2
				WHEN 'wednesday' THEN 3
				WHEN 'thursday' THEN 4
				WHEN 'friday' THEN 5
				WHEN 'saturday' THEN 6
				WHEN 'sunday' THEN 7
				ELSE 8
			END,
			start_time ASC
	`;
	return rows;
}

export async function fetchMyAbsenceRequests(userId: string): Promise<StaffScheduleAbsence[]> {
	const rows = await sql<StaffScheduleAbsence[]>`
		SELECT
			a.id,
			a.user_id::text AS user_id,
			u.name AS user_name,
			a.start_date::text AS start_date,
			a.end_date::text AS end_date,
			a.start_time::text AS start_time,
			a.end_time::text AS end_time,
			COALESCE(a.status, 'approved')::text AS status,
			a.note::text AS note
		FROM staff_absence a
		JOIN users u ON u.id::text = a.user_id::text
		WHERE a.user_id::text = ${userId}
		ORDER BY a.start_date DESC, a.start_time DESC
	`;
	return rows;
}

export async function fetchStaffScheduleUntemplatedShifts(weekStartInput?: string): Promise<StaffScheduleUntemplatedShift[]> {
	const { weekStart, weekEnd } = getWeekDateRange(weekStartInput);
	const rows = await sql<StaffScheduleUntemplatedShift[]>`
		SELECT
			s.id,
			s.user_id::text AS user_id,
			u.name AS user_name,
			COALESCE(u.coach_capacity, 6)::int AS coach_capacity,
			s.date::text AS date,
			s.start_time::text AS start_time,
			s.end_time::text AS end_time,
			COALESCE((
				SELECT ARRAY_AGG(ust.shift_type ORDER BY ust.shift_type)
				FROM untemplated_shift_type ust
				WHERE ust.untemplated_shift_id = s.id
			), ARRAY['coach']::text[]) AS shift_types
		FROM untemplated_shift s
		JOIN users u ON u.id::text = s.user_id::text
		WHERE s.date >= ${weekStart}::date
			AND s.date <= ${weekEnd}::date
		ORDER BY s.date ASC, s.start_time ASC
	`;
	return rows;
}

export async function fetchWeeklyOpenShifts(weekStartInput?: string): Promise<StaffScheduleOpenShift[]> {
	const { weekStart, days } = getWeekDateRange(weekStartInput);
	const templateRows = await sql<Array<{
		id: number;
		template_name: string;
		weekday: string;
		start_time: string;
		end_time: string;
		start_date: string;
		end_date: string;
		shift_types: string[];
	}>>`
		SELECT
			ts.id,
			t.name AS template_name,
			LOWER(ts.weekday) AS weekday,
			ts.start_time::text AS start_time,
			ts.end_time::text AS end_time,
			r.start_date::text AS start_date,
			r.end_date::text AS end_date,
			COALESCE((
				SELECT ARRAY_AGG(tst.shift_type ORDER BY tst.shift_type)
				FROM template_shift_type tst
				WHERE tst.template_shift_id = ts.id
			), ARRAY['coach']::text[]) AS shift_types
		FROM template_date_range r
		JOIN shift_template t ON t.id = r.template_id
		JOIN template_shift ts ON ts.template_id = t.id
		LEFT JOIN assigned_staff a ON a.template_shift_id = ts.id
		WHERE r.start_date <= (${weekStart}::date + INTERVAL '6 day')
			AND r.end_date >= ${weekStart}::date
		GROUP BY ts.id, t.name, ts.weekday, ts.start_time, ts.end_time, r.start_date, r.end_date
		HAVING COUNT(a.id) = 0
	`;

	const expanded: StaffScheduleOpenShift[] = [];
	for (const row of templateRows) {
		for (const day of days) {
			if (day.date < row.start_date || day.date > row.end_date) continue;
			if (day.weekday.toLowerCase() !== row.weekday) continue;
			expanded.push({
				id: row.id,
				date: day.date,
				weekday: day.weekday,
				start_time: row.start_time,
				end_time: row.end_time,
				shift_types: normalizeShiftTypes(row.shift_types),
				source: 'template',
				template_name: row.template_name,
			});
		}
	}

	return expanded.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
		return (a.template_name || '').localeCompare(b.template_name || '');
	});
}

export async function fetchTemplateViewData(): Promise<StaffScheduleTemplateViewData> {
	const templates = await sql<StaffScheduleTemplate[]>`
		SELECT id, name
		FROM shift_template
		ORDER BY name ASC
	`;

	const ranges = await sql<StaffScheduleTemplateDateRange[]>`
		SELECT
			id,
			template_id,
			start_date::text AS start_date,
			end_date::text AS end_date
		FROM template_date_range
		ORDER BY start_date DESC
	`;

	const shifts = await sql<StaffScheduleTemplateShift[]>`
		SELECT
			id,
			template_id,
			INITCAP(weekday) AS weekday,
			start_time::text AS start_time,
			end_time::text AS end_time,
			COALESCE((
				SELECT ARRAY_AGG(tst.shift_type ORDER BY tst.shift_type)
				FROM template_shift_type tst
				WHERE tst.template_shift_id = ts.id
			), ARRAY['coach']::text[]) AS shift_types
		FROM template_shift
		AS ts
		ORDER BY template_id ASC,
			CASE LOWER(weekday)
				WHEN 'monday' THEN 1
				WHEN 'tuesday' THEN 2
				WHEN 'wednesday' THEN 3
				WHEN 'thursday' THEN 4
				WHEN 'friday' THEN 5
				WHEN 'saturday' THEN 6
				WHEN 'sunday' THEN 7
				ELSE 8
			END,
			start_time ASC
	`;

	const assignments = await sql<StaffScheduleAssignedStaff[]>`
		SELECT
			a.id,
			a.template_shift_id,
			a.user_id::text AS user_id,
			u.name AS user_name,
			COALESCE(u.coach_capacity, 6)::int AS coach_capacity
		FROM assigned_staff a
		JOIN users u ON u.id::text = a.user_id::text
		ORDER BY a.template_shift_id ASC, u.name ASC
	`;

	return { templates, ranges, shifts, assignments };
}

type ExpandedShiftRow = {
	id: number | null;
	date: string;
	weekday: StaffScheduleWeekday;
	user_id: string;
	user_name: string;
	coach_capacity: number;
	start_time: string;
	end_time: string;
	shift_types: string[];
	source: 'template' | 'untemplated';
	template_name: string | null;
};

export async function fetchExpandedWeeklyStaffShifts(
	weekStartInput?: string,
	applyAbsenceFilter = true,
): Promise<StaffScheduleDailyShift[]> {
	const { weekStart, weekEnd } = getWeekDateRange(weekStartInput);
	return fetchExpandedStaffShiftsForDateRange(weekStart, weekEnd, applyAbsenceFilter);
}

async function fetchExpandedStaffShiftsForDateRange(
	startDate: string,
	endDate: string,
	applyAbsenceFilter = true,
): Promise<StaffScheduleDailyShift[]> {
	const days = buildDateRangeDays(startDate, endDate);
	const templateRows = await sql<Array<{
		id: number;
		template_name: string;
		weekday: string;
		start_time: string;
		end_time: string;
		user_id: string;
		user_name: string;
		coach_capacity: number;
		start_date: string;
		end_date: string;
		shift_types: string[];
	}>>`
		SELECT
			ts.id,
			t.name AS template_name,
			LOWER(ts.weekday) AS weekday,
			ts.start_time::text AS start_time,
			ts.end_time::text AS end_time,
			a.user_id::text AS user_id,
			u.name AS user_name,
			COALESCE(u.coach_capacity, 6)::int AS coach_capacity,
			r.start_date::text AS start_date,
			r.end_date::text AS end_date,
			COALESCE((
				SELECT ARRAY_AGG(tst.shift_type ORDER BY tst.shift_type)
				FROM template_shift_type tst
				WHERE tst.template_shift_id = ts.id
			), ARRAY['coach']::text[]) AS shift_types
		FROM template_date_range r
		JOIN shift_template t ON t.id = r.template_id
		JOIN template_shift ts ON ts.template_id = t.id
		JOIN assigned_staff a ON a.template_shift_id = ts.id
		JOIN users u ON u.id::text = a.user_id::text
		WHERE r.start_date <= ${endDate}::date
			AND r.end_date >= ${startDate}::date
	`;

	const untemplatedRows = await sql<StaffScheduleUntemplatedShift[]>`
		SELECT
			s.id,
			s.user_id::text AS user_id,
			u.name AS user_name,
			COALESCE(u.coach_capacity, 6)::int AS coach_capacity,
			s.date::text AS date,
			s.start_time::text AS start_time,
			s.end_time::text AS end_time,
			COALESCE((
				SELECT ARRAY_AGG(ust.shift_type ORDER BY ust.shift_type)
				FROM untemplated_shift_type ust
				WHERE ust.untemplated_shift_id = s.id
			), ARRAY['coach']::text[]) AS shift_types
		FROM untemplated_shift s
		JOIN users u ON u.id::text = s.user_id::text
		WHERE s.date >= ${startDate}::date
			AND s.date <= ${endDate}::date
		ORDER BY s.date ASC, s.start_time ASC
	`;
	const absences = (await fetchStaffScheduleAbsencesForDateRange(startDate, endDate)).filter((absence) => absence.status === 'approved');

	const expanded: ExpandedShiftRow[] = [];

	for (const row of templateRows) {
		for (const day of days) {
			if (day.date < row.start_date || day.date > row.end_date) {
				continue;
			}
			if (day.weekday.toLowerCase() !== row.weekday) {
				continue;
			}
			expanded.push({
				id: row.id,
				date: day.date,
				weekday: day.weekday,
				user_id: row.user_id,
				user_name: row.user_name,
				coach_capacity: row.coach_capacity,
				start_time: row.start_time,
				end_time: row.end_time,
				shift_types: normalizeShiftTypes(row.shift_types),
				source: 'template',
				template_name: row.template_name,
			});
		}
	}

	for (const row of untemplatedRows) {
		const dateObj = new Date(`${row.date}T00:00:00`);
		expanded.push({
			id: row.id,
			date: row.date,
			weekday: weekdayForDate(dateObj),
			user_id: row.user_id,
			user_name: row.user_name,
			coach_capacity: row.coach_capacity,
			start_time: row.start_time,
			end_time: row.end_time,
			shift_types: normalizeShiftTypes(row.shift_types),
			source: 'untemplated',
			template_name: null,
		});
	}

	if (!applyAbsenceFilter) {
		return expanded.sort((a, b) => {
			if (a.date !== b.date) return a.date.localeCompare(b.date);
			if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
			return a.user_name.localeCompare(b.user_name);
		});
	}

	const result: ExpandedShiftRow[] = [];

	for (const shift of expanded) {
		const blockedRanges = absences
			.filter((a) => a.user_id === shift.user_id)
			.map((a) => effectiveAbsenceWindowForDate(a, shift.date))
			.filter((r): r is { start: string; end: string } => r !== null)
			.map((r) => intersectTimeRanges(shift.start_time, shift.end_time, r.start, r.end))
			.filter((r): r is { start: string; end: string } => r !== null);

		if (blockedRanges.length === 0) {
			result.push(shift);
			continue;
		}

		const mergedBlocked = mergeRanges(blockedRanges);
		let remaining: Array<{ start: string; end: string }> = [{
			start: shift.start_time,
			end: shift.end_time,
		}];

		for (const blocked of mergedBlocked) {
			const next: Array<{ start: string; end: string }> = [];
			for (const seg of remaining) {
				if (!overlaps(seg.start, seg.end, blocked.start, blocked.end)) {
					next.push(seg);
					continue;
				}
				if (seg.start < blocked.start) {
					next.push({ start: seg.start, end: blocked.start });
				}
				if (seg.end > blocked.end) {
					next.push({ start: blocked.end, end: seg.end });
				}
			}
			remaining = next.filter((seg) => seg.start < seg.end);
			if (remaining.length === 0) break;
		}

		for (const seg of remaining) {
			result.push({
				...shift,
				start_time: seg.start,
				end_time: seg.end,
			});
		}
	}

	return result.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
		return a.user_name.localeCompare(b.user_name);
	});
}

export async function fetchWeeklyScheduleView(weekStartInput?: string): Promise<{
	weekStart: string;
	weekEnd: string;
	days: StaffScheduleWeeklyDay[];
}> {
	const { weekStart, weekEnd, days } = getWeekDateRange(weekStartInput);
	const [shifts, rawShifts, absences] = await Promise.all([
		fetchExpandedWeeklyStaffShifts(weekStartInput),
		fetchExpandedWeeklyStaffShifts(weekStartInput, false),
		fetchStaffScheduleAbsences(weekStartInput),
	]);
	const approvedAbsences = absences.filter((absence) => absence.status === 'approved');

	const grouped: StaffScheduleWeeklyDay[] = days.map((d) => ({
		date: d.date,
		weekday: d.weekday,
		shifts: shifts.filter((s) => s.date === d.date),
		absence_flags: approvedAbsences
			.map((absence) => {
				const absenceWindow = effectiveAbsenceWindowForDate(absence, d.date);
				if (!absenceWindow) return null;

				const overlapsForShift = rawShifts
					.filter((shift) => shift.date === d.date && shift.user_id === absence.user_id)
					.map((shift) =>
						intersectTimeRanges(
							shift.start_time,
							shift.end_time,
							absenceWindow.start,
							absenceWindow.end,
						),
					)
					.filter((range): range is { start: string; end: string } => range !== null);

				if (overlapsForShift.length === 0) return null;

				const merged = mergeRanges(overlapsForShift);
				return {
					absence_id: absence.id,
					user_id: absence.user_id,
					user_name: absence.user_name,
					ranges: merged.map((r) => ({
						start_time: r.start,
						end_time: r.end,
					})),
				};
			})
			.filter(
				(
					item,
				): item is {
					absence_id: number;
					user_id: string;
					user_name: string;
					ranges: Array<{ start_time: string; end_time: string }>;
				} => item !== null,
			),
	}));

	return { weekStart, weekEnd, days: grouped };
}

export async function fetchMyWeeklySchedule(userId: string, weekStartInput?: string): Promise<{
	weekStart: string;
	weekEnd: string;
	days: StaffPersonalScheduleDay[];
}> {
	const { weekStart, weekEnd, days } = getWeekDateRange(weekStartInput);
	const allShifts = await fetchExpandedWeeklyStaffShifts(weekStartInput);

	const grouped: StaffPersonalScheduleDay[] = days.map((day) => {
		const myShifts = allShifts
			.filter((shift) => shift.date === day.date && shift.user_id === userId)
			.map((shift) => {
				const coWorkers = allShifts
					.filter((other) => other.date === shift.date)
					.filter((other) => other.user_id !== shift.user_id)
					.filter((other) => overlaps(other.start_time, other.end_time, shift.start_time, shift.end_time))
					.map((other) => ({
						user_id: other.user_id,
						user_name: other.user_name,
						start_time: other.start_time,
						end_time: other.end_time,
					}));

				const byUser = new Map<string, { user_id: string; user_name: string; start_time: string; end_time: string }>();
				for (const worker of coWorkers) {
					const existing = byUser.get(worker.user_id);
					if (!existing) {
						byUser.set(worker.user_id, worker);
					} else {
						if (worker.start_time < existing.start_time) existing.start_time = worker.start_time;
						if (worker.end_time > existing.end_time) existing.end_time = worker.end_time;
					}
				}

				return {
					date: shift.date,
					weekday: shift.weekday,
					start_time: shift.start_time,
					end_time: shift.end_time,
					shift_types: shift.shift_types,
					co_workers: Array.from(byUser.values()).sort((a, b) => a.user_name.localeCompare(b.user_name)),
				};
			})
			.sort((a, b) => a.start_time.localeCompare(b.start_time));

		return {
			date: day.date,
			weekday: day.weekday,
			shifts: myShifts,
		};
	});

	return { weekStart, weekEnd, days: grouped };
}

export async function fetchClassCoverageView(weekStartInput?: string): Promise<StaffScheduleClassBlock[]> {
	const { weekStart, days } = getWeekDateRange(weekStartInput);
	const sessionBlocks = await sql<Array<{
		date: string;
		weekday: string;
		start_time: string;
		end_time: string;
		total_load: number;
		courses: Array<{ course_id: string; course_name: string }>;
	}>>`
		WITH week_days AS (
			SELECT
				(${weekStart}::date + i * INTERVAL '1 day')::date AS date,
				LOWER(TO_CHAR((${weekStart}::date + i * INTERVAL '1 day')::date, 'FMDay')) AS weekday
			FROM GENERATE_SERIES(0, 6) AS gs(i)
		), all_loads AS (
			-- Regular enrolled students (excluding absences)
			SELECT
				wd.date,
				wd.weekday,
				s.start_time,
				s.end_time,
				COALESCE(st.load, 1) AS load,
				c.id AS course_id,
				c.name AS course_name
			FROM week_days wd
			JOIN sessions s ON LOWER(s.weekday) = wd.weekday
			JOIN enrolments e ON e.session_id = s.id
				AND (e.start_date IS NULL OR e.start_date <= wd.date)
				AND (e.end_date IS NULL OR e.end_date >= wd.date)
			JOIN students st ON st.id = e.student_id
			JOIN courses c ON c.id = e.course_id
			LEFT JOIN absences a ON a.enrolment_id = e.id AND a.date = wd.date
			WHERE a.id IS NULL
			UNION ALL
			-- Makeup students
			SELECT
				wd.date,
				wd.weekday,
				s.start_time,
				s.end_time,
				COALESCE(st.load, 1) AS load,
				c.id AS course_id,
				c.name AS course_name
			FROM week_days wd
			JOIN makeups m ON m.date = wd.date
			JOIN sessions s ON s.id = m.session_id
			JOIN students st ON st.id = m.student_id
			JOIN courses c ON c.id = m.course_id
			UNION ALL
			-- Trial students
			SELECT
				wd.date,
				wd.weekday,
				s.start_time,
				s.end_time,
				1.0 AS load,
				c.id AS course_id,
				c.name AS course_name
			FROM week_days wd
			JOIN trials t ON t.date = wd.date
			JOIN sessions s ON s.id = t.session_id
			JOIN courses c ON c.id = t.course_id
		)
		SELECT
			date::text AS date,
			INITCAP(weekday) AS weekday,
			start_time::text AS start_time,
			end_time::text AS end_time,
			COALESCE(SUM(load), 0)::float8 AS total_load,
			COALESCE(
				JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('course_id', course_id::text, 'course_name', course_name))
					FILTER (WHERE course_id IS NOT NULL),
				'[]'::jsonb
			) AS courses
		FROM all_loads
		GROUP BY date, weekday, start_time, end_time
		ORDER BY date ASC, start_time ASC
	`;

	const qualifications = await fetchStaffScheduleQualifications();
	const qualificationSet = new Set(qualifications.map((q) => `${q.user_id}|${q.course_id}`));

	const staffShifts = await fetchExpandedWeeklyStaffShifts(weekStartInput);
	const pickupWindowStart = '15:15:00';
	const pickupWindowEnd = '15:30:00';

	const sessionsByDate = new Map<
		string,
		Array<{
			date: string;
			weekday: string;
			start_time: string;
			end_time: string;
			total_load: number;
			courses: Array<{ course_id: string; course_name: string }>;
		}>
	>();
	for (const s of sessionBlocks) {
		const arr = sessionsByDate.get(s.date) || [];
		arr.push(s);
		sessionsByDate.set(s.date, arr);
	}

	const segmentedBlocks: Array<{
		date: string;
		weekday: string;
		start_time: string;
		end_time: string;
		total_load: number;
		courses: Array<{ course_id: string; course_name: string }>;
	}> = [];

	for (const day of days) {
		const daySessions = sessionsByDate.get(day.date) || [];
		if (daySessions.length === 0) continue;

		const boundaries = Array.from(
			new Set(daySessions.flatMap((s) => [s.start_time, s.end_time])),
		).sort((a, b) => a.localeCompare(b));

		for (let i = 0; i < boundaries.length - 1; i += 1) {
			const segStart = boundaries[i];
			const segEnd = boundaries[i + 1];
			if (segStart >= segEnd) continue;

			const active = daySessions.filter((s) => overlaps(s.start_time, s.end_time, segStart, segEnd));
			if (active.length === 0) continue;

			const totalLoad = active.reduce((sum, s) => sum + Number(s.total_load || 0), 0);
			const byCourse = new Map<string, { course_id: string; course_name: string }>();
			for (const s of active) {
				for (const c of s.courses || []) {
					if (!byCourse.has(c.course_id)) {
						byCourse.set(c.course_id, c);
					}
				}
			}

			segmentedBlocks.push({
				date: day.date,
				weekday: day.weekday,
				start_time: segStart,
				end_time: segEnd,
				total_load: totalLoad,
				courses: Array.from(byCourse.values()),
			});
		}
	}

	const blocks: StaffScheduleClassBlock[] = segmentedBlocks.map((block) => {
		const coursesForBlock = block.courses || [];
		const present = staffShifts
			.filter((shift) => shift.date === block.date)
			.filter((shift) => shift.shift_types.includes('coach'))
			.filter((shift) => overlaps(shift.start_time, shift.end_time, block.start_time, block.end_time));

		const byUser = new Map<string, StaffScheduleClassBlock['staff_present'][number]>();
		for (const p of present) {
			const existing = byUser.get(p.user_id);
			if (!existing) {
				byUser.set(p.user_id, {
					user_id: p.user_id,
					user_name: p.user_name,
					coach_capacity: p.coach_capacity,
					start_time: p.start_time,
					end_time: p.end_time,
				});
			} else {
				if (p.start_time < existing.start_time) existing.start_time = p.start_time;
				if (p.end_time > existing.end_time) existing.end_time = p.end_time;
			}
		}

		const staffPresent = Array.from(byUser.values()).sort((a, b) => a.user_name.localeCompare(b.user_name));
		const totalCoachCapacity = staffPresent.reduce((sum, s) => sum + Number(s.coach_capacity || 0), 0);
		const presentUserIds = new Set(staffPresent.map((s) => s.user_id));

		const qualificationWarnings = coursesForBlock
			.filter((course) => {
				for (const userId of presentUserIds) {
					if (qualificationSet.has(`${userId}|${course.course_id}`)) {
						return false;
					}
				}
				return true;
			})
			.map((course) => `No qualified coach present for ${course.course_name}`);

		return {
			date: block.date,
			weekday: (block.weekday || days.find((d) => d.date === block.date)?.weekday || 'Monday') as StaffScheduleWeekday,
			start_time: block.start_time,
			end_time: block.end_time,
			total_load: Number(block.total_load || 0),
			total_coach_capacity: totalCoachCapacity,
			capacity_delta: totalCoachCapacity - Number(block.total_load || 0),
			qualification_warnings: qualificationWarnings,
			staff_present: staffPresent,
		};
	});

	return blocks;
}

function schoolToShiftType(schoolName: string): string | null {
	const normalized = schoolName.trim().toLowerCase();
	if (normalized === 'frankland') return 'pickup_frankland';
	if (normalized === 'jackman') return 'pickup_jackman';
	return null;
}

export async function fetchWeeklyPickupCoverageWarnings(weekStartInput?: string): Promise<StaffSchedulePickupCoverageWarning[]> {
	const rows = await fetchWeeklyPickupCoverageRows(weekStartInput);
	return rows
		.filter((row) => !row.has_coverage)
		.map((row) => ({
			date: row.date,
			weekday: row.weekday,
			school_name: row.school_name,
			pickup_count: row.pickup_count,
			message: `${row.pickup_count} pickup student(s) at ${row.school_name} but no assigned pickup coach`,
		}));
}

export async function fetchWeeklyPickupCoverageRows(weekStartInput?: string): Promise<StaffSchedulePickupCoverageRow[]> {
	const { weekStart, days } = getWeekDateRange(weekStartInput);

	const pickupDemand = await sql<Array<{
		date: string;
		weekday: string;
		school_name: string;
		pickup_count: number;
	}>>`
		WITH week_days AS (
			SELECT
				(${weekStart}::date + i * INTERVAL '1 day')::date AS date,
				INITCAP(LOWER(TO_CHAR((${weekStart}::date + i * INTERVAL '1 day')::date, 'FMDay'))) AS weekday
			FROM GENERATE_SERIES(0, 6) AS gs(i)
		)
		SELECT
			wd.date::text AS date,
			wd.weekday,
			LOWER(TRIM(p.school_name)) AS school_name,
			COUNT(*)::int AS pickup_count
		FROM week_days wd
		JOIN pickups p ON LOWER(TRIM(p.weekday)) = LOWER(TRIM(wd.weekday))
		LEFT JOIN pickup_absences pa ON pa.pickup_id = p.id AND pa.date = wd.date
		WHERE pa.id IS NULL
		GROUP BY wd.date, wd.weekday, LOWER(TRIM(p.school_name))
	`;

	const staffShifts = await fetchExpandedWeeklyStaffShifts(weekStartInput);
	const pickupWindowStart = '15:15:00';
	const pickupWindowEnd = '15:30:00';

	const rows: StaffSchedulePickupCoverageRow[] = [];
	for (const demand of pickupDemand) {
		const requiredType = schoolToShiftType(demand.school_name);
		if (!requiredType) {
			continue;
		}

		const assignedCoaches = Array.from(
			new Set(
				staffShifts
					.filter((shift) => shift.date === demand.date && shift.shift_types.includes(requiredType))
					.filter((shift) => overlaps(shift.start_time, shift.end_time, pickupWindowStart, pickupWindowEnd))
					.map((shift) => shift.user_name),
			),
		).sort((a, b) => a.localeCompare(b));

		rows.push({
			date: demand.date,
			weekday: (demand.weekday || days.find((d) => d.date === demand.date)?.weekday || 'Monday') as StaffScheduleWeekday,
			school_name: demand.school_name,
			pickup_count: demand.pickup_count,
			assigned_coaches: assignedCoaches,
			has_coverage: assignedCoaches.length > 0,
		});
	}

	return rows.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		return a.school_name.localeCompare(b.school_name);
	});
}

async function fetchPickupCoverageRowsForDateRange(startDate: string, endDate: string): Promise<StaffSchedulePickupCoverageRow[]> {
	const days = buildDateRangeDays(startDate, endDate);
	const dayMap = new Map(days.map((d) => [d.date, d.weekday]));

	const pickupDemand = await sql<Array<{
		date: string;
		weekday: string;
		school_name: string;
		pickup_count: number;
	}>>`
		WITH date_range AS (
			SELECT
				d::date AS date,
				INITCAP(LOWER(TO_CHAR(d::date, 'FMDay'))) AS weekday
			FROM GENERATE_SERIES(${startDate}::date, ${endDate}::date, INTERVAL '1 day') AS d
		)
		SELECT
			dr.date::text AS date,
			dr.weekday,
			LOWER(TRIM(p.school_name)) AS school_name,
			COUNT(*)::int AS pickup_count
		FROM date_range dr
		JOIN pickups p ON LOWER(TRIM(p.weekday)) = LOWER(TRIM(dr.weekday))
		LEFT JOIN pickup_absences pa ON pa.pickup_id = p.id AND pa.date = dr.date
		WHERE pa.id IS NULL
		GROUP BY dr.date, dr.weekday, LOWER(TRIM(p.school_name))
	`;

	const expandedShifts = await fetchExpandedStaffShiftsForDateRange(startDate, endDate);
	const pickupWindowStart = '15:15:00';
	const pickupWindowEnd = '15:30:00';

	const rows: StaffSchedulePickupCoverageRow[] = [];
	for (const demand of pickupDemand) {
		const requiredType = schoolToShiftType(demand.school_name);
		if (!requiredType) {
			continue;
		}

		const assignedCoaches = Array.from(
			new Set(
				expandedShifts
					.filter((shift) => shift.date === demand.date && shift.shift_types.includes(requiredType))
					.filter((shift) => overlaps(shift.start_time, shift.end_time, pickupWindowStart, pickupWindowEnd))
					.map((shift) => shift.user_name),
			),
		).sort((a, b) => a.localeCompare(b));

		rows.push({
			date: demand.date,
			weekday: (dayMap.get(demand.date) || 'Monday') as StaffScheduleWeekday,
			school_name: demand.school_name,
			pickup_count: demand.pickup_count,
			assigned_coaches: assignedCoaches,
			has_coverage: assignedCoaches.length > 0,
		});
	}

	return rows.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		return a.school_name.localeCompare(b.school_name);
	});
}

export async function fetchFutureStaffScheduleOverview(monthInput?: string): Promise<StaffScheduleFutureOverview> {
	const { selectedMonth, fromDate, throughDate } = monthDateRange(monthInput);
	const days = buildDateRangeDays(fromDate, throughDate);

	type FutureSessionBlockRow = {
		date: string;
		weekday: string;
		start_time: string;
		end_time: string;
		total_load: number;
		courses: Array<{ course_id: string; course_name: string }>;
	};

	const [pendingAbsenceRequests, qualifications, users, staffAvailability, expandedShifts, allAbsencesForMonth, sessionBlocks, pickupRows] = await Promise.all([
		fetchPendingStaffAbsenceRequests(),
		fetchStaffScheduleQualifications(),
		fetchStaffScheduleUsers(),
		sql<Array<{ user_id: string; weekday: string; start_time: string; end_time: string }>>`
			SELECT
				user_id::text AS user_id,
				INITCAP(weekday) AS weekday,
				start_time::text AS start_time,
				end_time::text AS end_time
			FROM staff_availability
		`,
		fetchExpandedStaffShiftsForDateRange(fromDate, throughDate),
		fetchStaffScheduleAbsencesForDateRange(fromDate, throughDate),
		sql<FutureSessionBlockRow[]>`
			WITH date_range AS (
				SELECT
					d::date AS date,
					LOWER(TO_CHAR(d::date, 'FMDay')) AS weekday
				FROM GENERATE_SERIES(${fromDate}::date, ${throughDate}::date, INTERVAL '1 day') AS d
			), all_loads AS (
				-- Regular enrolled students (excluding absences)
				SELECT
					dr.date,
					dr.weekday,
					s.start_time,
					s.end_time,
					COALESCE(st.load, 1) AS load,
					c.id AS course_id,
					c.name AS course_name
				FROM date_range dr
				JOIN sessions s ON LOWER(s.weekday) = dr.weekday
				JOIN enrolments e ON e.session_id = s.id
					AND (e.start_date IS NULL OR e.start_date <= dr.date)
					AND (e.end_date IS NULL OR e.end_date >= dr.date)
				JOIN students st ON st.id = e.student_id
				JOIN courses c ON c.id = e.course_id
				LEFT JOIN absences a ON a.enrolment_id = e.id AND a.date = dr.date
				WHERE a.id IS NULL
				UNION ALL
				-- Makeup students
				SELECT
					dr.date,
					dr.weekday,
					s.start_time,
					s.end_time,
					COALESCE(st.load, 1) AS load,
					c.id AS course_id,
					c.name AS course_name
				FROM date_range dr
				JOIN makeups m ON m.date = dr.date
				JOIN sessions s ON s.id = m.session_id
				JOIN students st ON st.id = m.student_id
				JOIN courses c ON c.id = m.course_id
				UNION ALL
				-- Trial students
				SELECT
					dr.date,
					dr.weekday,
					s.start_time,
					s.end_time,
					1.0 AS load,
					c.id AS course_id,
					c.name AS course_name
				FROM date_range dr
				JOIN trials t ON t.date = dr.date
				JOIN sessions s ON s.id = t.session_id
				JOIN courses c ON c.id = t.course_id
			)
			SELECT
				date::text AS date,
				INITCAP(weekday) AS weekday,
				start_time::text AS start_time,
				end_time::text AS end_time,
				COALESCE(SUM(load), 0)::float8 AS total_load,
				COALESCE(
					JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('course_id', course_id::text, 'course_name', course_name))
						FILTER (WHERE course_id IS NOT NULL),
					'[]'::jsonb
				) AS courses
			FROM all_loads
			GROUP BY date, weekday, start_time, end_time
			ORDER BY date ASC, start_time ASC
		`,
		fetchPickupCoverageRowsForDateRange(fromDate, throughDate),
	]);

	const qualificationsByUser = new Map<string, Set<string>>();
	const courseNameById = new Map<string, string>();
	for (const q of qualifications) {
		const set = qualificationsByUser.get(q.user_id) || new Set<string>();
		set.add(q.course_id);
		qualificationsByUser.set(q.user_id, set);
		courseNameById.set(q.course_id, q.course_name);
	}

	const availabilityByUser = new Map<string, Array<{ weekday: string; start_time: string; end_time: string }>>();
	for (const row of staffAvailability) {
		const list = availabilityByUser.get(row.user_id) || [];
		list.push(row);
		availabilityByUser.set(row.user_id, list);
	}

	const sessionsByDate = new Map<string, FutureSessionBlockRow[]>();
	for (const s of sessionBlocks) {
		const arr = sessionsByDate.get(s.date) || [];
		arr.push(s);
		sessionsByDate.set(s.date, arr);
	}

	const segmentedBlocks: Array<{
		date: string;
		weekday: StaffScheduleWeekday;
		start_time: string;
		end_time: string;
		total_load: number;
		courses: Array<{ course_id: string; course_name: string }>;
	}> = [];

	for (const day of days) {
		const daySessions = sessionsByDate.get(day.date) || [];
		if (daySessions.length === 0) continue;
		const boundaries = Array.from(new Set(daySessions.flatMap((s) => [s.start_time, s.end_time]))).sort((a, b) => a.localeCompare(b));
		for (let i = 0; i < boundaries.length - 1; i += 1) {
			const segStart = boundaries[i];
			const segEnd = boundaries[i + 1];
			if (segStart >= segEnd) continue;
			const active = daySessions.filter((s) => overlaps(s.start_time, s.end_time, segStart, segEnd));
			if (active.length === 0) continue;
			const totalLoad = active.reduce((sum, s) => sum + Number(s.total_load || 0), 0);
			const byCourse = new Map<string, { course_id: string; course_name: string }>();
			for (const s of active) {
				for (const c of s.courses || []) {
					if (!byCourse.has(c.course_id)) {
						byCourse.set(c.course_id, c);
					}
				}
			}
			segmentedBlocks.push({
				date: day.date,
				weekday: day.weekday,
				start_time: segStart,
				end_time: segEnd,
				total_load: totalLoad,
				courses: Array.from(byCourse.values()),
			});
		}
	}

	function findSuggestions(params: {
		date: string;
		weekday: StaffScheduleWeekday;
		start_time: string;
		end_time: string;
		presentUserIds: Set<string>;
		requiredCourseIds: string[];
	}): StaffScheduleWarningSuggestion[] {
		const dayShiftCount = new Map<string, number>();
		for (const shift of expandedShifts) {
			if (shift.date !== params.date) continue;
			dayShiftCount.set(shift.user_id, (dayShiftCount.get(shift.user_id) || 0) + 1);
		}

		const suggestions: StaffScheduleWarningSuggestion[] = [];
		for (const user of users) {
			if (params.presentUserIds.has(user.id)) continue;

			const hasShiftConflict = expandedShifts.some((shift) =>
				shift.user_id === user.id
				&& shift.date === params.date
				&& overlaps(shift.start_time, shift.end_time, params.start_time, params.end_time),
			);
			if (hasShiftConflict) continue;

			const hasAbsenceConflict = allAbsencesForMonth.some((absence) => {
				if (absence.status !== 'approved') return false;
				if (absence.user_id !== user.id) return false;
				const window = effectiveAbsenceWindowForDate(absence, params.date);
				if (!window) return false;
				return overlaps(window.start, window.end, params.start_time, params.end_time);
			});
			if (hasAbsenceConflict) continue;

			const availability = availabilityByUser.get(user.id) || [];
			const hasSavedAvailability = availability.length > 0;
			const isAvailable = !hasSavedAvailability || availability.some((slot) =>
				slot.weekday === params.weekday
				&& slot.start_time <= params.start_time
				&& slot.end_time >= params.end_time,
			);
			if (!isAvailable) continue;

			const userQualifications = qualificationsByUser.get(user.id) || new Set<string>();
			const matchedCourseIds = params.requiredCourseIds.filter((courseId) => userQualifications.has(courseId));
			if (params.requiredCourseIds.length > 0 && matchedCourseIds.length === 0) continue;

			const coversAllGaps = params.requiredCourseIds.length > 0 && matchedCourseIds.length === params.requiredCourseIds.length;
			const matchedNames = matchedCourseIds.map((courseId) => courseNameById.get(courseId) || courseId);
			suggestions.push({
				user_id: user.id,
				user_name: user.name,
				reason: coversAllGaps
					? 'Available and fills all qualification gaps'
					: matchedNames.length > 0
						? `Available and qualified for ${matchedNames.join(', ')}`
						: 'Available for this slot',
			});
		}

		return suggestions
			.sort((a, b) => {
				// Coaches that fill all gaps come first
				const aFillsAll = a.reason.includes('fills all');
				const bFillsAll = b.reason.includes('fills all');
				if (aFillsAll !== bFillsAll) return aFillsAll ? -1 : 1;
				// Then prefer coaches already working fewer shifts that day
				const aCount = dayShiftCount.get(a.user_id) || 0;
				const bCount = dayShiftCount.get(b.user_id) || 0;
				if (aCount !== bCount) return aCount - bCount;
				return a.user_name.localeCompare(b.user_name);
			});
	}

	const warnings: StaffScheduleFutureWarning[] = [];
	for (const block of segmentedBlocks) {
		const present = expandedShifts
			.filter((shift) => shift.date === block.date)
			.filter((shift) => shift.shift_types.includes('coach'))
			.filter((shift) => overlaps(shift.start_time, shift.end_time, block.start_time, block.end_time));

		const byUser = new Map<string, { user_id: string; start_time: string; end_time: string }>();
		for (const p of present) {
			const existing = byUser.get(p.user_id);
			if (!existing) {
				byUser.set(p.user_id, { user_id: p.user_id, start_time: p.start_time, end_time: p.end_time });
			} else {
				if (p.start_time < existing.start_time) existing.start_time = p.start_time;
				if (p.end_time > existing.end_time) existing.end_time = p.end_time;
			}
		}

		const presentUserIds = new Set(Array.from(byUser.keys()));
		const totalCoachCapacity = present.reduce((sum, s) => sum + Number(s.coach_capacity || 0), 0);
		const capacityDelta = totalCoachCapacity - Number(block.total_load || 0);
		const missingCourseIds = block.courses
			.map((course) => course.course_id)
			.filter((courseId) => {
				for (const userId of presentUserIds) {
					const userQualifications = qualificationsByUser.get(userId) || new Set<string>();
					if (userQualifications.has(courseId)) {
						return false;
					}
				}
				return true;
			});

		if (capacityDelta < 0) {
			warnings.push({
				type: 'understaffed',
				date: block.date,
				weekday: block.weekday,
				start_time: block.start_time,
				end_time: block.end_time,
				message: `Understaffed by ${Math.abs(capacityDelta)} capacity (load ${block.total_load}, coach capacity ${totalCoachCapacity}).`,
				suggestions: findSuggestions({
					date: block.date,
					weekday: block.weekday,
					start_time: block.start_time,
					end_time: block.end_time,
					presentUserIds,
					requiredCourseIds: block.courses.map((course) => course.course_id),
				}),
			});
		}

		if (missingCourseIds.length > 0) {
			const missingCourseNames = missingCourseIds.map((courseId) => courseNameById.get(courseId) || courseId);
			warnings.push({
				type: 'qualification',
				date: block.date,
				weekday: block.weekday,
				start_time: block.start_time,
				end_time: block.end_time,
				message: `No qualified coach present for ${missingCourseNames.join(', ')}.`,
				suggestions: findSuggestions({
					date: block.date,
					weekday: block.weekday,
					start_time: block.start_time,
					end_time: block.end_time,
					presentUserIds,
					requiredCourseIds: missingCourseIds,
				}),
			});
		}
	}

	// Add pickup warnings
	for (const pickupRow of pickupRows) {
		if (!pickupRow.has_coverage) {
			const pickupType = schoolToShiftType(pickupRow.school_name) || pickupRow.school_name;
			const suggestions: StaffScheduleWarningSuggestion[] = [];

			// Find coaches available for pickup on that day with the required shift type
			for (const user of users) {
				// Check if they have a shift conflict on that day
				const hasShiftConflict = expandedShifts.some(
					(shift) => shift.date === pickupRow.date && shift.user_id === user.id && shift.shift_types.includes(pickupType),
				);
				if (hasShiftConflict) continue;

				// Check if they have an approved absence on that day
				const hasAbsenceConflict = allAbsencesForMonth.some((absence) => {
					if (absence.status !== 'approved') return false;
					if (absence.user_id !== user.id) return false;
					const window = effectiveAbsenceWindowForDate(absence, pickupRow.date);
					if (!window) return false;
					// Pickup window is 15:15-15:30
					return overlaps(window.start, window.end, '15:15:00', '15:30:00');
				});
				if (hasAbsenceConflict) continue;

				// Check if they have availability set for this weekday
				const availability = availabilityByUser.get(user.id) || [];
				const hasSavedAvailability = availability.length > 0;
				const isAvailable = !hasSavedAvailability || availability.some((slot) =>
					slot.weekday === pickupRow.weekday
					&& slot.start_time <= '15:15:00'
					&& slot.end_time >= '15:30:00',
				);
				if (!isAvailable) continue;

				suggestions.push({
					user_id: user.id,
					user_name: user.name,
					reason: 'Available for pickup',
				});
			}

			warnings.push({
				type: 'pickup',
				date: pickupRow.date,
				weekday: pickupRow.weekday,
				start_time: '15:15:00',
				end_time: '15:30:00',
				message: `${pickupRow.pickup_count} pickup student(s) at ${pickupRow.school_name} but no assigned pickup coach.`,
				suggestions,
			});
		}
	}

	return {
		selected_month: selectedMonth,
		from_date: fromDate,
		through_date: throughDate,
		pending_absence_requests: pendingAbsenceRequests,
		all_absences: allAbsencesForMonth,
		warnings: warnings.sort((a, b) => {
			if (a.date !== b.date) return a.date.localeCompare(b.date);
			if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
			if (a.type !== b.type) return a.type.localeCompare(b.type);
			return a.message.localeCompare(b.message);
		}),
	};
}

