// Tables

import { StringValidation } from "zod/v3";

export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  converge_setup_amount: number;
  converge_setup_date: number;
  converge_setup_desc: string;
}

export type Student = {
  id:string;
  name: string;
  customer_id: string;
}

export type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
};

export type RecurringInvoice = {
  id: string;
  customer_id: string;
  day_of_month: 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|-1;
  every: number;
  start_date: Date;
  end_after: number | null;
};

export type Payment = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  status: 'submitted' | 'requires attention';
}

export type Session = {
  id: string;
  start_time: string;
  end_time: string;
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  student_count?: number;
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

export type Pickup = {
  id: string;
  student_id: string;
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  waiver_signed: boolean;
  school_name: 'Frankland' | 'Jackman';
  teacher_name: string;
  room_number: number;
  invoice_id: string;
}


// Formatted Data for display in Tables

export type DisplayEnrolment = {
  id: string;
  course_name: string;
  weekday: string;
  start_time: string;
  end_time: string;
}

export type CustomerTableData = {
  id: string;
  name: string;
  email: string;
  total_due: number;
  next_invoice_date: Date | null;
  next_invoice_amount: number;
  next_payment_date: Date | null;
  next_payment_amount: number;
  regular_payment_amount: number;
  students: Student[];
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
};

export type ScheduleRow = {
  enrolment_id: string;
  student_id: number;
  name: string;
  course_name: string;
};

export type StudentSpecificData = {

}

export type CustomerSpecificData = {

}