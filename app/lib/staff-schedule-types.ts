export const STAFF_SCHEDULE_WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
] as const;

export type StaffScheduleWeekday = (typeof STAFF_SCHEDULE_WEEKDAYS)[number];

export type StaffScheduleUser = {
	id: string;
	name: string;
	coach_capacity: number;
};

export type StaffScheduleCourseOption = {
	id: string;
	name: string;
};

export type StaffScheduleQualification = {
	id: number;
	user_id: string;
	user_name: string;
	course_id: string;
	course_name: string;
};

export type StaffScheduleTemplate = {
	id: number;
	name: string;
};

export type StaffScheduleTemplateDateRange = {
	id: number;
	template_id: number;
	start_date: string;
	end_date: string;
};

export type StaffScheduleTemplateShift = {
	id: number;
	template_id: number;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
	shift_types: string[];
};

export type StaffScheduleAssignedStaff = {
	id: number;
	template_shift_id: number;
	user_id: string;
	user_name: string;
	coach_capacity: number;
};

export type StaffScheduleAbsence = {
	id: number;
	user_id: string;
	user_name: string;
	start_date: string;
	end_date: string;
	start_time: string;
	end_time: string;
	status: 'requested' | 'approved';
	note: string | null;
};

export type StaffScheduleUntemplatedShift = {
	id: number;
	user_id: string;
	user_name: string;
	coach_capacity: number;
	date: string;
	start_time: string;
	end_time: string;
	shift_types: string[];
};

export type StaffScheduleOpenShift = {
	id: number;
	date: string;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
	shift_types: string[];
	source: 'template';
	template_name: string | null;
};

export type StaffAvailabilityBlock = {
	id: number;
	user_id: string;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
};

export type StaffScheduleDailyShift = {
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

export type StaffSchedulePickupCoverageWarning = {
	date: string;
	weekday: StaffScheduleWeekday;
	school_name: string;
	pickup_count: number;
	message: string;
};

export type StaffSchedulePickupCoverageRow = {
	date: string;
	weekday: StaffScheduleWeekday;
	school_name: string;
	pickup_count: number;
	assigned_coaches: string[];
	has_coverage: boolean;
};

export type StaffScheduleWeeklyDay = {
	date: string;
	weekday: StaffScheduleWeekday;
	shifts: StaffScheduleDailyShift[];
	absence_flags: Array<{
		absence_id: number;
		user_id: string;
		user_name: string;
		ranges: Array<{
			start_time: string;
			end_time: string;
		}>;
	}>;
};

export type StaffScheduleClassBlock = {
	date: string;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
	total_load: number;
	total_coach_capacity: number;
	capacity_delta: number;
	qualification_warnings: string[];
	staff_present: Array<{
		user_id: string;
		user_name: string;
		coach_capacity: number;
		start_time: string;
		end_time: string;
	}>;
};

export type StaffScheduleTemplateViewData = {
	templates: StaffScheduleTemplate[];
	ranges: StaffScheduleTemplateDateRange[];
	shifts: StaffScheduleTemplateShift[];
	assignments: StaffScheduleAssignedStaff[];
};

export type StaffPersonalScheduleShift = {
	date: string;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
	shift_types: string[];
	co_workers: Array<{
		user_id: string;
		user_name: string;
		start_time: string;
		end_time: string;
	}>;
};

export type StaffPersonalScheduleDay = {
	date: string;
	weekday: StaffScheduleWeekday;
	shifts: StaffPersonalScheduleShift[];
};

export type StaffScheduleWarningSuggestion = {
	user_id: string;
	user_name: string;
	reason: string;
};

export type StaffScheduleFutureWarning = {
	type: 'understaffed' | 'qualification' | 'pickup';
	date: string;
	weekday: StaffScheduleWeekday;
	start_time: string;
	end_time: string;
	message: string;
	suggestions: StaffScheduleWarningSuggestion[];
};

export type StaffScheduleFutureOverview = {
	selected_month: string;
	from_date: string;
	through_date: string;
	pending_absence_requests: StaffScheduleAbsence[];
	all_absences: StaffScheduleAbsence[];
	warnings: StaffScheduleFutureWarning[];
};

