import { fetchAllAccountsManagement, fetchAccountsManagementPages } from "@/app/lib/data";
import ScratchAccountsTable from "@/app/ui/scratch-accounts-table";
import NewAccountButton from "@/app/ui/new-account-button";
import { auth } from "@/auth";
import { Suspense } from "react";

export default async function Page(props: {
    searchParams?: Promise<{
        query?: string;
        unassignedOnly?: string;
        page?: string;
    }>;
}) {
    const session = await auth();
    const searchParams = await props.searchParams;
    const query = searchParams?.query || '';
    const unassignedOnly = searchParams?.unassignedOnly === 'true';
    const currentPage = Number(searchParams?.page) || 1;
    
    if (!session?.user) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-semibold text-red-600">Not Authenticated</h1>
                <p>Please log in to view this page.</p>
            </div>
        );
    }
    
    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-800">Account Management</h1>
                    <p className="text-sm text-gray-600 mt-1">Manage Scratch accounts, Roblox accounts, and Laptop assignments</p>
                </div>
                <NewAccountButton />
            </div>
            
            <Suspense fallback={<div>Loading...</div>}>
                <ScratchAccountsTable 
                    query={query} 
                    unassignedOnly={unassignedOnly}
                    currentPage={currentPage}
                />
            </Suspense>
        </div>
    );
}
