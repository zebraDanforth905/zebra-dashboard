import { unassignStudent, deleteRecurringInvoice, createSlipInfo } from "../lib/actions";
import { PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { create } from "domain";
import Link from "next/link";

export function UnassignStudentButton({id}: {id: string}) {
    const unassignStudentWithId = unassignStudent.bind(null, id);
    return <form action={unassignStudentWithId}>
        <button type="submit" className="text-sm text-red-600 hover:underline onhover:text-red-800 flex items-center hover:cursor-pointer">
            <TrashIcon className="inline-block w-4 h-4 mr-1" />
        </button>
    </form>
}

export function EditInvoiceButton({id}: {id: string}) {

    return <Link 
        href={`/dashboard/billing/recurring_invoices/${id}`}
        className="text-sm text-blue-600 hover:underline hover:text-blue-800 flex items-center hover:cursor-pointer">
        <PencilIcon className="inline-block w-4 h-4 mr-1" />
    </Link>
}
export function DeleteInvoiceButton({id}: {id: string}) {

    return <form action={deleteRecurringInvoice}>
        <input name='id' value={id} readOnly hidden/>
        <button type="submit" className="text-sm text-red-600 hover:underline onhover:text-red-800 flex items-center hover:cursor-pointer">
            <TrashIcon className="inline-block w-4 h-4 mr-1" />
        </button>
    </form>
}

export function NewInvoiceButton({id}: {id: string}) {
    return <Link 
        href={`/dashboard/billing/${id}/edit/new`}
        className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 hover:cursor-pointer">
        New Recurring Invoice
    </Link>
}

export function CloseButton({returnUrl}: {returnUrl?: string}) {
    return <Link 
        href={returnUrl ? returnUrl : `/dashboard/billing`}
        className="inline-block rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 hover:cursor-pointer">
        <XMarkIcon className="inline-block w-5 h-5" />
    </Link>
}

export function NewSlipButton({userId}: {userId: string}) {
    return <form action={createSlipInfo}>
        <input name='user_id' value={userId} readOnly hidden/>
        <button 
            type="submit"
            className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
            title="New LMS Slip"
        >
            <PencilIcon className="w-5 h-5" />
        </button>
    </form>
}