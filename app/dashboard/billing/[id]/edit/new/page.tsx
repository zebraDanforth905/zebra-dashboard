import RecurringInvoiceForm from '@/app/ui/billing/recurring-invoice-form';
import { fetchRecurringInvoiceById } from '@/app/lib/data';

export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
    const id = (await props.params)?.id;


    return <RecurringInvoiceForm customer_id={id} />;
}