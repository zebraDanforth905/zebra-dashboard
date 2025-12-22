// Staff Scheduling Types

export type ShiftTemplate = {
  id: string;
  name: string;
  weekday: number; // 0=Sun, 1=Mon, ... 6=Sat
  start_time: string; // HH:MM:SS format
  end_time: string;
  shift_type: string; // class, admin, etc
  is_active: boolean;
  created_by: string;
};

export type Shift = {
  id: string;
  name: string;
  starts_at: Date;
  ends_at: Date;
  event_type: string; // workshop, birthday, special
  notes: string | null;
  created_by: string;
  assignments?: ShiftAssignment[];
};

export type ShiftAssignment = {
  id: string;
  template_id: string | null;
  shift_id: string | null;
  staff_user_id: string;
  effective_from: Date | null;
  effective_to: Date | null;
  role: string | null; // instructor, assistant
  created_by: string;
  staff_name?: string;
  template_name?: string;
  shift_name?: string;
};

export type StaffTimeOff = {
  id: string;
  staff_user_id: string;
  starts_at: Date;
  ends_at: Date;
  time_off_type: string; // vacation, sick, other
  status: string; // requested, approved, denied
  notes: string | null;
  created_by: string;
  staff_name?: string;
};

export type ShiftTemplateWithAssignments = ShiftTemplate & {
  assignments: ShiftAssignment[];
};
