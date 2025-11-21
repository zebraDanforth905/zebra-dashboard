'use client';

import { useState } from 'react';
import { PickupListDisplay } from '@/app/lib/definitions';
import PickupTable from './pickup-table';
import { deletePickup } from '@/app/lib/actions';
import ManageAbsencesModal from './manage-absences-modal';

type Props = {
  day: PickupListDisplay["weekday"];
  pickups: PickupListDisplay[];
  currentUserName: string;
};

export default function PickupTableWrapper({ day, pickups, currentUserName }: Props) {
  const [showManageAbsencesModal, setShowManageAbsencesModal] = useState(false);
  const [selectedPickup, setSelectedPickup] = useState<PickupListDisplay | null>(null);

  const handleManageAbsences = (pickupId: string) => {
    const pickup = pickups.find(p => p.id === pickupId);
    if (!pickup) return;

    setSelectedPickup(pickup);
    setShowManageAbsencesModal(true);
  };

  const handleDelete = async (pickupId: string) => {
    const pickup = pickups.find(p => p.id === pickupId);
    if (!pickup) return;

    if (confirm(`Are you sure you want to delete the pickup for ${pickup.name}?`)) {
      try {
        await deletePickup(pickupId);
        window.location.reload();
      } catch (error) {
        alert('Failed to delete pickup');
      }
    }
  };

  return (
    <>
      <PickupTable
        day={day}
        pickups={pickups}
        currentUserName={currentUserName}
        onManageAbsences={handleManageAbsences}
        onDelete={handleDelete}
      />
      
      {showManageAbsencesModal && selectedPickup && (
        <ManageAbsencesModal
          pickupId={selectedPickup.id}
          studentId={selectedPickup.student_id}
          studentName={selectedPickup.name}
          onClose={() => {
            setShowManageAbsencesModal(false);
            setSelectedPickup(null);
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
