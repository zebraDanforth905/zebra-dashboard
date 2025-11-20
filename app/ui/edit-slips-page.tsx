'use server'

import { fetchSlipInfoById } from "../lib/data";
import { SlipInfo } from "../lib/definitions";
import { NewSlipButton } from "./buttons";
import SlipForm from "./slip_form";

export default async function EditSlipPage (props: { userId: string }) {
    
    const userId = props.userId;
    const slip_info_list = await fetchSlipInfoById(userId);
    
    // Sort slips: big slips (with other_fields) first, then small slips
    const sortedSlips = [...slip_info_list].sort((a, b) => {
        const aIsBig = a.other_fields && Object.keys(a.other_fields).length > 0;
        const bIsBig = b.other_fields && Object.keys(b.other_fields).length > 0;
        
        // Big slips come first
        if (aIsBig && !bIsBig) return -1;
        if (!aIsBig && bIsBig) return 1;
        return 0;
    });
    
    // Pre-calculate which slips need page breaks
    const pageBreaks: boolean[] = [];
    let slipsOnCurrentPage = 0;
    let hasBigSlipOnCurrentPage = false;
    
    sortedSlips.forEach((slip_info, index) => {
        const isBig = slip_info.other_fields && Object.keys(slip_info.other_fields).length > 0;
        
        let shouldBreak = false;
        
        if (index > 0) {
            // If current page has a big slip and already has 2 slips, break
            if (hasBigSlipOnCurrentPage && slipsOnCurrentPage >= 2) {
                shouldBreak = true;
            }
            // If current page has only small slips and has 3 slips, break
            else if (!hasBigSlipOnCurrentPage && slipsOnCurrentPage >= 3) {
                shouldBreak = true;
            }
        }
        
        // Reset counters if we're breaking to a new page
        if (shouldBreak) {
            slipsOnCurrentPage = 0;
            hasBigSlipOnCurrentPage = false;
        }
        
        // Update counters for current slip
        slipsOnCurrentPage++;
        if (isBig) hasBigSlipOnCurrentPage = true;
        
        pageBreaks.push(shouldBreak);
    });
    
    return (
        <div className="p-6 print:p-0">
            
            {sortedSlips.length === 0 && (
                <div>No slip information found for your account.</div>
            )}
            {sortedSlips.length > 0 && sortedSlips.map((slip_info: SlipInfo, index: number) => (
                <div key={slip_info.id} className={pageBreaks[index] ? "print-page-break" : ""}>
                    <SlipForm slip_info={slip_info} />
                </div>
            ))}
            
        </div>
    );
}