import { fetchSlipInfoById } from "@/app/lib/data";
import { NewSlipButton } from "@/app/ui/buttons";
import EditSlipPage from "@/app/ui/edit-slips-page";
import PrintButton from "@/app/ui/print-button";
import EnrolmentSearch from "@/app/ui/enrolment-search";
import EnrolmentList from "@/app/ui/enrolment-list";
import { auth } from "@/auth";
import { Suspense } from "react";

export default async function Page (props: {
    searchParams?: Promise<{
        enrolmentQuery?: string;
    }>;
}) {
    const session = await auth();
    const searchParams = await props.searchParams;
    const enrolmentQuery = searchParams?.enrolmentQuery || '';
    
    console.log('Full session object:', JSON.stringify(session, null, 2));
    
    if (!session?.user) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold text-red-600">Not Authenticated</h1>
                <p>Please log in to view this page.</p>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-slate-700 print:bg-white">
            <div className="max-w-[8.5in] mx-auto bg-white shadow-2xl print:shadow-none print:max-w-full">
                <Suspense fallback={<div>Loading...</div>}>
                    <div className="p-6 print:hidden sticky top-0 bg-white border-b border-slate-200 z-10 space-y-4">
                        <div className="flex items-center justify-between">
                            <h1 className="text-2xl font-semibold text-slate-800">LMS Slips</h1>
                            <div className="flex gap-2">
                                {session.user.id &&<NewSlipButton userId={session.user.id} />}   
                                <PrintButton />
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <h2 className="text-sm font-medium text-gray-700">Add Slip from Student</h2>
                            <EnrolmentSearch placeholder="Search students by name, email, or course..." />
                            {enrolmentQuery && session.user.id && (
                                <EnrolmentList query={enrolmentQuery} userId={session.user.id} />
                            )}
                        </div>
                    </div>
                    
                    {session.user.id && (
                        <EditSlipPage userId={session.user.id} />
                    )}
                </Suspense>
            </div>
        </div>
    );
}