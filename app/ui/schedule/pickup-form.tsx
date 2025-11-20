import { addPickup, updatePickup } from "@/app/lib/actions";
import { CloseButton } from "../buttons";

export default function PickupForm({id, studentId, returnUrl} : {id?: string, studentId: string, returnUrl?: string }) {
    
    return <form action={id? updatePickup : addPickup}>
        <CloseButton returnUrl={returnUrl}/>
        <input type="hidden" name="id" value={id}/>
        <input type="hidden" name="studentId" value={studentId}/>
        <select name="school_name" required className="border p-2 rounded w-full mb-4">
            <option value="">Select School</option>
            <option value="frankland">Frankland</option>
            <option value="jackman">Jackman</option>
        </select>
        <input type="text" name="teacher_name" placeholder="Teacher Name" className="border p-2 rounded w-full mb-4"/>
        <input type="text" name="room_number" placeholder="Room Number" className="border p-2 rounded w-full mb-4"/>
        <select name="weekday" required className="border p-2 rounded w-full mb-4">
            <option value="">Select Day</option>
            <option value="monday">Monday</option>
            <option value="tuesday">Tuesday</option>
            <option value="wednesday">Wednesday</option>
            <option value="thursday">Thursday</option>
            <option value="friday">Friday</option>
        </select>
        <label className="flex items-center mb-4">
            <input type="checkbox" name="waiver_signed" className="mr-2"/>
            Waiver Signed
        </label>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
            {id ? 'Update Pickup' : 'Add Pickup'}
        </button>
    </form>;
}