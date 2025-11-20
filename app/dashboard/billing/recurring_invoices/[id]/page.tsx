import RecurringInvoiceForm from '@/app/ui/billing/recurring-invoice-form';
import { fetchRecurringInvoiceById } from '@/app/lib/data';

export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
    const id = (await props.params)?.id;

    const invoice = await fetchRecurringInvoiceById(id);
    const initial = invoice ? {
        id: invoice.id,
        customer_id: invoice.customer_id,
        amount: invoice.amount / 100,
        day_of_month: invoice.day_of_month,
        every: invoice.every,
        start_date: invoice.start_date,
        next_date: invoice.next_date,
        end_after: invoice.end_after,
        description: invoice.description
    } : undefined;


    return <RecurringInvoiceForm customer_id={initial?.customer_id ?? ""} initial={initial} />;
}