import { unassignStudent } from "../lib/actions";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
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
        can i write here?
    </Link>
}