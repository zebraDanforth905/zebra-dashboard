// Tables

import { StringValidation } from "zod/v3";

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

export type StudentSpecificData = {

}
export type CustomerSpecificData = {

}

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
  course_id: string;
  camp_type: 'FD' | 'PM' | 'AM';
  assigned_seat_number: number | null;
  special_needs: string | null;
  extended_care: boolean;
};

export type CampSessionWithEnrolments = {
  start_date: Date;
  end_date: Date;
  enrolment_count: number;
  enrolments: CampEnrolmentWithStudent[];
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
  email_sent_at: Date | null;
  email_sent_count: number;
  created_at: Date;
};

export type SummerSchedulingPayload = {
  summer_status: 'enrolling' | 'pausing' | 'no_change';
  session_ids: string[];
};

export type RestartPayload = {
  session_id: string;
};

export type OtherPayload = Record<string, never>;

export type ParentRequestType = 'summer_scheduling' | 'restart' | 'other';
export type ParentRequestStatus = 'pending' | 'reviewed' | 'completed' | 'superseded' | 'needs_manual_followup';

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
  current_weekday: string | null;
  current_start_time: string | null;
  latest_request: SummerSchedulingPayload | null;
  latest_request_id: string | null;
  latest_request_status: ParentRequestStatus | null;
};

export type ParentFormData = {
  token_id: string;
  customer_id: string;
  customer_name: string;
  students: ParentFormStudentData[];
  summer_sessions: (Session & { is_summer: boolean })[];
};

export type SummerStats = {
  total_families: number;
  responded: number;
  enrolling: number;
  pausing: number;
  no_change: number;
  pending: number;
  needs_followup: number;
  emailed: number;
};

export type SummerResponseRow = {
  request_id: string;
  student_id: string;
  student_name: string;
  parent_name: string;
  parent_email: string;
  summer_status: SummerSchedulingPayload['summer_status'] | 'other';
  session_labels: string[];
  current_weekday: string | null;
  current_start_time: string | null;
  status: ParentRequestStatus;
  custom_notes: string | null;
  submitted_at: Date;
};

export type ParentLinkRow = {
  token_id: string;
  customer_id: string;
  customer_name: string;
  email: string;
  student_names: string[];
  token: string;
  email_sent_at: Date | null;
  email_sent_count: number;
  has_responded: boolean;
};