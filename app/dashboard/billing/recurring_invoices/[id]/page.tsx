import { redirect } from 'next/navigation';
import { fetchRecurringInvoiceById } from '@/app/lib/data';

export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
    const id = (await props.params)?.id;
    const invoice = await fetchRecurringInvoiceById(id);
    
    // Redirect to the customer edit page where inline editing happens
    if (invoice) {
        redirect(`/dashboard/billing/${invoice.customer_id}/edit`);
    }
    
    return <div>Invoice not found</div>;
}
