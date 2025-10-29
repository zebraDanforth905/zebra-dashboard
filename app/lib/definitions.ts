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

export type Payment = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  status: 'scheduled' | 'submitted' | 'requires attention';
}

export type CustomerTableData = {
  id: string;
  name: string;
  email: string;
  total_due: number;
  next_payment_date: Date | null;
  next_payment_amount: number;
  regular_payment_amount: number;
  students: Student[];
}