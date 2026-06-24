// Tables

export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  user_type: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  alternate_name?: string | null;
  alternate_email?: string | null;
  setup_up_qbo?: boolean;
}

export type ConvergeRecurringPayment = {
    amount: number;
    billing_cycle: string;
    last_name: string;
    email: string;
    phone: string;
    exp_date: Date;
    start_date: Date;
    last_payment: Date;
    next_payment: Date;
    recurring_id: string;
    description: string;
    customer_id: string;
}

// create a camps page, where the user can see upcoming camps and click on them to see all the students enrolled in that camp session, add some or all campers to slip_info, and also access a drag and drop seating chart with cards for each student with their date of birth, session (FD, PM, AM), and course 
export type Student = {
  id:string;
  name: string;
  customer_id: string;
  dob?: Date;
  special_needs?: string;
  has_activity?: boolean;
  has_upcoming_start?: boolean;
}

export type CampSession = {
    id: string;
    start_date: Date;
    end_date: Date;
    extended_care: boolean;
    camp_type: 'FD' | 'PM' | 'AM';
}

export type CampEnrolment = {
    id: string;
    student_id: string;
    camp_session_id: string;
    course_id: string;
    assigned_seat_number: number;
}

export type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  description: string;
};

export type RecurringInvoice = {
  id: string;
  customer_id: string;
  amount: number;
  day_of_month: 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|-1;
  every: number;
  start_date: Date;
  next_date: Date;
  end_after: number | null;
  description: string;
};

export type Payment = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  status: 'submitted' | 'requires attention';
  comment: string | null;
}

export type Session = {
  id: string;
  start_time: string;
  end_time: string;
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  is_full?: boolean;
  student_count?: number;
  makeup_count?: number;
  trial_count?: number;
  absences?: number;
}

export type Course = {
  id: string;
  name: string;
  description: string;
}

export type Enrolment = {
  id: string;
  student_id: string;
  course_id: string;
  session_id: string;
  start_date: string;
  invoice_id: string;
}

export type ScratchAccount = {
  student_id?: string;
  username: string;
  password: string;
}

export type LaptopAssignment = {
  student_id: string;
  laptop_number: string;
}

export type RobloxAccount = {
  student_id: string;
  username: string;
  password: string;
}

export type SlipInfo = {
  id: string;
  student_name: string;
  user_id: string;
  lms_username: string;
  lms_password: string;
  course_name: string;
  other_fields?: { [key: string]: string; };
}

export type Pickup = {
  id: string;
  student_id: string;
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  waiver_signed: boolean;
  school_name: 'Frankland' | 'Jackman';
  teacher_name: string;
  room_number: string;
  invoice_id: string;
  comment?: string;
}

export type Trial = {
  id: string;
  name: string;
  course_id: string;
  session_id: string;
  date: Date;
}

export type Makeup = {
  id: string;
  student_id: string;
  session_id: string;
  course_id: string;
  date: Date;
}

export type Absence = {
  id: string;
  enrolment_id: string;
  date: Date;
}


export type StudentNote = {
  id: string;
  student_id: string;
  content: string;
  date: Date;
  creator: string;
};

export type CustomerNote = {
  id: string;
  customer_id: string;
  content: string;
  date: Date;
  creator: string;
};

export type TrialNote = {
  id: string;
  trial_id: string;
  content: string;
  date: Date;
  creator: string;
}

// Formatted Data for display in Tables

export type DisplayEnrolment = {
  id: string;
  course_name: string;
  weekday: string;
  start_time: string;
  end_time: string;
  start_date?: string;
}

export type CustomerTableData = {
  id: string;
  name: string;
  email: string;
  alternate_name?: string | null;
  alternate_email?: string | null;
  set_up_qbo?: boolean;
  total_due: number;
  next_invoice_date: Date | null;
  next_invoice_amount: number;
  regular_payment_amount: number;
  next_recurring_payment_amount: number | null;
  next_recurring_payment_date: Date | null;
  next_recurring_payment_description: string | null;
  students: Student[];
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
}

export type CustomerListData = {
  id: string;
  name: string;
  total_due: number;
};

export type StudentTableData = {
  id: string;
  name: string;
  customer_name: string | null;
  enrolled_courses: DisplayEnrolment[];
  pickup_days: Pickup[];
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
};

export type ScheduleRow = {
  enrolment_id: string;
  name: string;
  student_id: string;
  course_name: string;
  parent_name: string;
  absent?: boolean;
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
};

export type MakeupRow = {
  makeup_id: string;
  name: string;
  student_id: string;
  course_name: string;
  parent_name: string;
  date: Date;
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
}

export type TrialRow = {
  trial_id: string;
  name: string;
  course_name: string;
  date: Date;
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
}

export type RecurringInvoiceListData = {
  id: string;
  amount: number;
  day_of_month: number;
  every: number;
  next_date: Date;
  start_date: Date;
  end_after: number | null;
  description: string;
}

export type StudentSpecificData = Record<string, never>;
export type CustomerSpecificData = Record<string, never>;

export type PickupListDisplay = {
  id: string;
  student_id: string;
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  waiver_signed: boolean;
  school_name: string;
  teacher_name: string;
  room_number: string;
  invoice_id: string;
  name: string;
  absent: boolean;
  comment?: string;
  recent_note?: {
    id: string;
    content: string;
    date: Date;
    creator: string;
  } | null;
}

export type InvoiceTableData = {
    id: string;
    amount: number;
    date: Date;
    description: string;
}

export type CampEnrolmentWithStudent = {
  id: string;
  student_id: string;
  student_name: string;
  dob: Date | null;
  course_id: string | null;
  course_name: string | null;
  camp_type: 'FD' | 'PM' | 'AM';
  assigned_seat_number: number | null;
  note: string | null;
  special_needs: string | null;
  allergies: string | null;
  extended_care: boolean;
  parent_name: string | null;
  parent_phone: string | null;
  parent_request_notes: string | null;
};

export type CampLmsStatus =
  | 'verified'
  | 'missing_user'
  | 'missing_course'
  | 'needs_followup'
  | 'not_applicable';

export type CampLmsChecklistRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  suggested_lms_login: string;
  course_id: string | null;
  course_name: string | null;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  start_date: Date;
  end_date: Date;
  lms_course_name: string | null;
  lms_course_link: string | null;
  mapping_notes: string | null;
  status: CampLmsStatus | null;
  status_note: string | null;
  checked_at: Date | null;
  checked_by_name: string | null;
};

export type CampLmsChecklistSummary = {
  total: number;
  verified: number;
  missing_setup: number;
  needs_followup: number;
  unmapped: number;
  unchecked: number;
  not_applicable: number;
};

export type CampLmsChecklistData = {
  schema_ready: boolean;
  rows: CampLmsChecklistRow[];
  summary: CampLmsChecklistSummary;
};

export type CampPrepResourceKind = 'scratch' | 'roblox' | 'laptop';

export type CampPrepStatus =
  | 'ready'
  | 'partial'
  | 'missing'
  | 'not_needed';

export type CampAccountPrepInventoryItem = {
  id: string;
  label: string;
  password: string | null;
};

export type CampAccountPrepRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  course_id: string | null;
  course_name: string | null;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  start_date: Date;
  end_date: Date;
  needs_scratch: boolean;
  needs_roblox: boolean;
  needs_unity: boolean;
  needs_laptop: boolean;
  scratch_username: string | null;
  scratch_password: string | null;
  roblox_username: string | null;
  roblox_password: string | null;
  laptop_number: string | null;
  missing_resources: CampPrepResourceKind[];
  status: CampPrepStatus;
};

export type CampAccountPrepSummary = {
  total: number;
  setup_needed: number;
  ready: number;
  partial: number;
  missing: number;
  not_needed: number;
  needs_unity: number;
  missing_scratch: number;
  missing_roblox: number;
  missing_laptop: number;
};

export type CampAccountPrepChecklistData = {
  rows: CampAccountPrepRow[];
  inventory: {
    scratch_accounts: CampAccountPrepInventoryItem[];
    roblox_accounts: CampAccountPrepInventoryItem[];
    laptops: CampAccountPrepInventoryItem[];
  };
  summary: CampAccountPrepSummary;
};

export type CampSessionWithEnrolments = {
  start_date: Date;
  end_date: Date;
  enrolment_count: number;
  enrolments: CampEnrolmentWithStudent[];
};

export type CampPrintableScheduleRow = {
  camp_enrolment_id: string;
  student_id: string;
  student_name: string;
  assigned_seat_number: number | null;
  seat_assignments: Array<{
    date: string;
    seat: number;
  }>;
  course_id: string | null;
  course_name: string | null;
  camp_type: 'FD' | 'PM' | 'AM';
  extended_care: boolean;
  start_date: Date;
  end_date: Date;
  note: string | null;
  special_needs: string | null;
  allergies: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_request_notes: string | null;
};

export type CampPrintableStudentListField =
  | 'student'
  | 'parent'
  | 'type'
  | 'camp'
  | 'days'
  | 'room'
  | 'medical'
  | 'notes';

export type CampPrintableStudentListOverride = {
  student_id: string;
  field: CampPrintableStudentListField;
  value: string;
};

export type CampPrintableScheduleData = {
  start_date: string;
  end_date: string;
  rows: CampPrintableScheduleRow[];
  student_list_overrides: CampPrintableStudentListOverride[];
};

export type SeatAssignment = {
  enrolment_id: string;
  seat: number;
};

export type IncidentReportDetails = {
  incident_date: string;
  incident_time: string;
  student_name: string;
  coaches: string[];
  what_happened: string;
  what_led_up: string;
  other_students: string[];
  parent_involvement: string;
  how_addressed: string;
};

export type IncidentReport = {
  id: string;
  details: IncidentReportDetails | string; // Can be JSON object or string for backward compatibility
  status: 'new' | 'in progress' | 'closed';
  user_id: string;
  date: Date;
  user_name?: string;
  created_at?: Date;
};

// Parent self-serve system

export type ParentToken = {
  id: string;
  customer_id: string;
  token: string;
  last_exported_at: Date | null;
  last_seen_active_at: Date | null;
  last_active_snapshot: StudentCourseEntry[];
  export_count: number;
  created_at: Date;
};

// portal_parent_id is set automatically by the portal scrape

export type SummerSchedulingPayload = {
  summer_status: 'enrolling' | 'pausing' | 'no_change';
  session_ids: string[];
  waitlist_session_ids?: string[];
  // ISO 'YYYY-MM-DD' per session id; populated for 'enrolling'.
  session_start_dates?: Record<string, string>;
  current_sessions_snapshot?: CurrentSessionSummary[];
  pickup_requested?: boolean;
  pickup_school?: 'Jackman' | 'Frankland' | 'other';
  pickup_school_other?: string;
  fall_status: 'same' | 'change' | 'pause' | 'unsure' | 'not_returning';
  // ISO 'YYYY-MM-DD'; populated for fall_status='same'.
  fall_start_date?: string;
  fall_session_ids: string[];
  fall_waitlist_session_ids?: string[];
  // ISO 'YYYY-MM-DD' per fall session id; populated for fall_status='change'.
  fall_session_start_dates?: Record<string, string>;
  fall_notes?: string;
};

export type RestartPayload = {
  session_id: string;
};

export type OtherPayload = {
  current_sessions_snapshot?: CurrentSessionSummary[];
  fall_status?: 'same' | 'change' | 'pause' | 'unsure' | 'not_returning';
  fall_start_date?: string;
  fall_session_ids?: string[];
  fall_waitlist_session_ids?: string[];
  fall_session_start_dates?: Record<string, string>;
  pickup_requested?: boolean;
  pickup_school?: 'Jackman' | 'Frankland' | 'other';
  pickup_school_other?: string;
  fall_notes?: string;
};

export type ParentRequestType = 'summer_scheduling' | 'restart' | 'other';
export type ParentRequestStatus = 'pending' | 'reviewed' | 'completed' | 'superseded' | 'needs_manual_followup';
export type ParentRequestSubmittedBy = 'parent' | 'staff';

export type ParentRequest =
  | {
      id: string;
      token_id: string;
      student_id: string;
      request_type: 'summer_scheduling';
      status: ParentRequestStatus;
      is_latest: boolean;
      payload: SummerSchedulingPayload;
      custom_notes: string | null;
      submitted_by: ParentRequestSubmittedBy;
      submitted_by_name: string | null;
      enrolment_ids: string[];
      submitted_at: Date;
      reviewed_at: Date | null;
      reviewed_by: string | null;
      created_at: Date;
      updated_at: Date;
    }
  | {
      id: string;
      token_id: string;
      student_id: string;
      request_type: 'restart';
      status: ParentRequestStatus;
      is_latest: boolean;
      payload: RestartPayload;
      custom_notes: string | null;
      submitted_by: ParentRequestSubmittedBy;
      submitted_by_name: string | null;
      enrolment_ids: string[];
      submitted_at: Date;
      reviewed_at: Date | null;
      reviewed_by: string | null;
      created_at: Date;
      updated_at: Date;
    }
  | {
      id: string;
      token_id: string;
      student_id: string;
      request_type: 'other';
      status: ParentRequestStatus;
      is_latest: boolean;
      payload: OtherPayload;
      custom_notes: string | null;
      submitted_by: ParentRequestSubmittedBy;
      submitted_by_name: string | null;
      enrolment_ids: string[];
      submitted_at: Date;
      reviewed_at: Date | null;
      reviewed_by: string | null;
      created_at: Date;
      updated_at: Date;
    };

// Data shapes for summer dashboard queries

export type ParentFormStudentData = {
  student_id: string;
  student_name: string;
  current_sessions: CurrentSessionSummary[];
  current_weekday: string | null;
  current_start_time: string | null;
  current_pickup_school: string | null;
  latest_request: Partial<SummerSchedulingPayload> | null;
  latest_request_type: ParentRequestType | null;
  latest_request_id: string | null;
  latest_request_status: ParentRequestStatus | null;
  latest_custom_notes: string | null;
};

export type CurrentSessionSummary = {
  weekday: string;
  start_time: string;
  pickup_school: string | null;
  course_name?: string | null;
};

export type ParentFormData = {
  token_id: string;
  customer_id: string;
  customer_name: string;
  customer_alternate_name: string | null;
  students: ParentFormStudentData[];
  summer_sessions: (Session & { is_summer: boolean })[];
  fall_sessions: (Session & { student_count: number; coach_capacity: number })[];
  course_options: Course[];
};

export type SubmittedStudentSummary = {
  student_name: string;
  current_weekday: string | null;
  current_start_time: string | null;
  current_sessions_snapshot: CurrentSessionSummary[];
  summer_status: string;
  session_labels: string[];
  waitlist_session_labels: string[];
  pickup_requested: boolean;
  pickup_school: string | null;
  pickup_school_other: string | null;
  fall_status: string | null;
  fall_start_date: string | null;
  fall_session_labels: string[];
  fall_waitlist_session_labels: string[];
  fall_notes: string | null;
  custom_notes: string | null;
  previous_submission_count: number;
};

export type SubmittedChoices = {
  customer_name: string;
  customer_alternate_name: string | null;
  students: SubmittedStudentSummary[];
};

export type SessionChoiceSummary = {
  session_id: string;
  weekday: string;
  start_time: string;
  start_date: string | null;
};

export type SummerStats = {
  total_families: number;
  total_students: number;
  responded_families: number;
  responded_students: number;
  waitlisted_students: number;
  summer_attending_families: number;
  summer_attending_students: number;
  summer_pausing_families: number;
  summer_pausing_students: number;
  summer_custom_families: number;
  summer_custom_students: number;
  summer_no_change_families: number;
  summer_no_change_students: number;
  fall_keep_current_families: number;
  fall_keep_current_students: number;
  fall_change_families: number;
  fall_change_students: number;
  fall_unsure_or_pause_families: number;
  fall_unsure_or_pause_students: number;
  fall_not_returning_families: number;
  fall_not_returning_students: number;
  pending: number;
  needs_followup: number;
  exported: number;
  parent_submitted: number;
  staff_submitted: number;
};

export type SummerResponseHistoryItem = {
  request_id: string;
  request_type: ParentRequestType;
  summer_status: SummerSchedulingPayload['summer_status'] | 'other';
  session_labels: string[];
  waitlist_session_labels: string[];
  pickup_requested: boolean;
  pickup_school: string | null;
  pickup_school_other: string | null;
  fall_status: SummerSchedulingPayload['fall_status'] | null;
  fall_start_date: string | null;
  fall_session_labels: string[];
  fall_waitlist_session_labels: string[];
  fall_notes: string | null;
  status: ParentRequestStatus;
  custom_notes: string | null;
  submitted_by: ParentRequestSubmittedBy;
  submitted_by_name: string | null;
  submitted_at: Date | string;
  added_to_portal_at: Date | string | null;
  added_to_portal_by: string | null;
};

export type SummerResponseRow = {
  request_id: string;
  customer_id: string;
  student_id: string;
  student_name: string;
  student_note_id: string | null;
  student_note: string | null;
  student_note_date: Date | null;
  student_note_creator: string | null;
  parent_name: string;
  parent_email: string;
  parent_alternate_email: string | null;
  customer_note_id: string | null;
  customer_note: string | null;
  customer_note_date: Date | null;
  customer_note_creator: string | null;
  summer_status: SummerSchedulingPayload['summer_status'] | 'other';
  session_labels: string[];
  session_choices: SessionChoiceSummary[];
  waitlist_session_labels: string[];
  pickup_requested: boolean;
  pickup_school: string | null;
  pickup_school_other: string | null;
  fall_status: SummerSchedulingPayload['fall_status'] | null;
  fall_start_date: string | null;
  fall_session_labels: string[];
  fall_session_choices: SessionChoiceSummary[];
  fall_waitlist_session_labels: string[];
  fall_notes: string | null;
  current_weekday: string | null;
  current_start_time: string | null;
  current_sessions_snapshot: CurrentSessionSummary[];
  status: ParentRequestStatus;
  custom_notes: string | null;
  submitted_by: ParentRequestSubmittedBy;
  submitted_by_name: string | null;
  submitted_at: Date;
  token_last_exported_at: Date | null;
  token_export_count: number;
  added_to_portal_at: Date | null;
  added_to_portal_by: string | null;
  previous_submission_count: number;
  previous_submitted_at: Date | null;
  submission_history: SummerResponseHistoryItem[];
};

export type SummerScheduleStudent = {
  name: string;
  course: string | null;
};

export type SummerScheduleRow = {
  session_id: string;
  weekday: string;
  start_time: string;
  end_time: string;
  is_full: boolean;
  student_count: number;
  students: SummerScheduleStudent[];
};

export type StudentCourseEntry = {
  student_id?: string;
  student_name: string;
  course_name: string | null;
  weekday: string;
  start_time: string;
  pickup_school?: string | null;
};

export type ParentLinkRow = {
  token_id: string;
  customer_id: string;
  customer_name: string;
  alternate_name: string | null;
  email: string;
  alternate_email: string | null;
  name_locked: boolean;
  email_locked: boolean;
  alternate_email_locked: boolean;
  alternate_name_locked: boolean;
  student_names: string[];
  student_courses: StudentCourseEntry[];
  student_count: number;
  active_student_count: number;
  token: string;
  last_exported_at: Date | null;
  last_seen_active_at: Date | null;
  export_count: number;
  fall_confirmation_eligible: boolean;
  has_responded: boolean;
  has_internal_response: boolean;
};
