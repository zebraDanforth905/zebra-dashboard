import { redirect } from 'next/navigation';

export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
    const id = (await props.params)?.id;
    
    // Redirect to the customer edit page where inline creating happens
    redirect(`/dashboard/billing/${id}/edit`);
}