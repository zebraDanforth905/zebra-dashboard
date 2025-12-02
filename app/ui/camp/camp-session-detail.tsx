'use client';

import { useState } from 'react';
import { CampSessionWithEnrolments } from '@/app/lib/definitions';
import { createSlipsForCampers, updateCampSeatAssignment } from '@/app/lib/actions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { CakeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

type Seat = {
  id: string;
  number: number;
  row: number;
  col: number;
  enrolmentId: string | null;
};

type CamperCardProps = {
  enrolment: CampSessionWithEnrolments['enrolments'][0];
  isSelected: boolean;
  onToggleSelect: () => void;
  isDragging?: boolean;
};

function CamperCard({ enrolment, isSelected, onToggleSelect, isDragging = false }: CamperCardProps) {
  const formatDOB = (dob: Date | null) => {
    if (!dob) return 'N/A';
    return new Date(dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getCampTypeBadge = (type: 'FD' | 'PM' | 'AM') => {
    const colors = {
      FD: 'bg-blue-100 text-blue-700',
      AM: 'bg-yellow-100 text-yellow-700',
      PM: 'bg-orange-100 text-orange-700',
    };
    const labels = { FD: 'Full Day', AM: 'Morning', PM: 'Afternoon' };
    return { color: colors[type], label: labels[type] };
  };

  const badge = getCampTypeBadge(enrolment.camp_type);

  return (
    <div
      className={`relative bg-white border-2 rounded-lg p-3 transition-all ${
        isDragging ? 'shadow-2xl' : 'shadow-sm'
      } ${isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
      />

      <h3 className="font-semibold text-slate-900 text-sm mb-1 pr-6">
        {enrolment.student_name}
      </h3>

      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <CakeIcon className="h-3 w-3" />
          <span>{formatDOB(enrolment.dob)}</span>
        </div>

        <div className="flex flex-wrap gap-1">
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${badge.color}`}>
            {badge.label}
          </span>
          {enrolment.course_id && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-700">
              {enrolment.course_id}
            </span>
          )}
        </div>

        {enrolment.special_needs && (
          <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Note:</strong> {enrolment.special_needs}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCamperCard({ enrolment, isSelected, onToggleSelect }: CamperCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: enrolment.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="cursor-move" {...attributes} {...listeners}>
      <CamperCard enrolment={enrolment} isSelected={isSelected} onToggleSelect={onToggleSelect} />
    </div>
  );
}

function SeatSpot({ seat, enrolment, isSelected, onToggleSelect }: { 
  seat: Seat; 
  enrolment: CampSessionWithEnrolments['enrolments'][0] | null;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: seat.id,
  });

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: seat.id,
    disabled: !enrolment,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`relative border-2 border-dashed rounded-lg p-2 min-h-[140px] transition-all ${
        isOver ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-slate-50'
      }`}
    >
      <div className="absolute top-1 left-1 w-6 h-6 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold">
        {seat.number}
      </div>

      {enrolment ? (
        <div ref={setSortableRef} style={style} className="mt-6 cursor-move" {...attributes} {...listeners}>
          <CamperCard 
            enrolment={enrolment} 
            isSelected={isSelected} 
            onToggleSelect={onToggleSelect}
            isDragging={isDragging}
          />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-slate-400 text-xs mt-6">
          Drop here
        </div>
      )}
    </div>
  );
}

export default function CampSessionDetail({ session }: { session: CampSessionWithEnrolments }) {
  // Generate seat layout (6 rows x 5 columns = 30 seats)
  const ROWS = 6;
  const COLS = 5;
  
  const initialSeats: Seat[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const seatNumber = row * COLS + col + 1;
      const matchingEnrolment = session.enrolments.find(e => e.assigned_seat_number === seatNumber);
      initialSeats.push({
        id: `seat-${seatNumber}`,
        number: seatNumber,
        row,
        col,
        enrolmentId: matchingEnrolment?.id || null,
      });
    }
  }

  const [seats, setSeats] = useState<Seat[]>(initialSeats);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreatingSlips, setIsCreatingSlips] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const enrolmentMap = new Map(session.enrolments.map(e => [e.id, e]));
  const unassignedEnrolments = session.enrolments.filter(
    e => !seats.some(s => s.enrolmentId === e.id)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find if we're dragging from unassigned or from a seat
    const fromSeat = seats.find(s => s.id === activeId || s.enrolmentId === activeId);
    const toSeat = seats.find(s => s.id === overId);

    if (!toSeat) return;

    // Determine which enrolment is being moved
    let movingEnrolmentId: string | null = null;
    if (fromSeat) {
      movingEnrolmentId = fromSeat.enrolmentId;
    } else {
      // It's from unassigned list
      movingEnrolmentId = activeId;
    }

    if (!movingEnrolmentId) return;

    // Swap logic
    const newSeats = seats.map(seat => {
      if (fromSeat && seat.id === fromSeat.id) {
        // Clear the source seat
        return { ...seat, enrolmentId: toSeat.enrolmentId };
      }
      if (seat.id === toSeat.id) {
        // Place in target seat
        return { ...seat, enrolmentId: movingEnrolmentId };
      }
      return seat;
    });

    setSeats(newSeats);

    // Update database
    const movedEnrolment = newSeats.find(s => s.enrolmentId === movingEnrolmentId);
    if (movedEnrolment) {
      await updateCampSeatAssignment(movingEnrolmentId, movedEnrolment.number);
    }

    // If there was a swap, update the other one too
    if (toSeat.enrolmentId && fromSeat) {
      await updateCampSeatAssignment(toSeat.enrolmentId, fromSeat.number);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(session.enrolments.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleCreateSlips = async () => {
    if (selectedIds.size === 0) return;

    setIsCreatingSlips(true);
    const studentIds = session.enrolments
      .filter((e) => selectedIds.has(e.id))
      .map((e) => e.student_id);

    const result = await createSlipsForCampers(studentIds, session.id);

    if (result.ok) {
      alert(`Created ${result.created} slip(s) successfully!`);
      deselectAll();
    } else {
      alert(`Error: ${result.error}`);
    }
    setIsCreatingSlips(false);
  };

  const activeEnrolment = activeId ? (
    enrolmentMap.get(activeId) || 
    enrolmentMap.get(seats.find(s => s.id === activeId)?.enrolmentId || '')
  ) : null;

  const items = [...seats.map(s => s.id), ...unassignedEnrolments.map(e => e.id)];

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Seating Chart</h2>
            <p className="text-sm text-slate-600">
              Drag and drop campers to assign seats. Select campers to create login slips.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition"
            >
              Deselect All
            </button>
            <button
              onClick={handleCreateSlips}
              disabled={selectedIds.size === 0 || isCreatingSlips}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <DocumentTextIcon className="h-4 w-4" />
              Create Slips ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>

      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Seating Area */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <span className="px-2 py-1 bg-slate-100 rounded text-xs">Room Layout</span>
                <span className="text-xs text-slate-500">Front of Room →</span>
              </h3>
              <SortableContext items={items} strategy={rectSortingStrategy}>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                  {seats.map((seat) => {
                    const enrolment = seat.enrolmentId ? enrolmentMap.get(seat.enrolmentId) : null;
                    return (
                      <SeatSpot
                        key={seat.id}
                        seat={seat}
                        enrolment={enrolment || null}
                        isSelected={enrolment ? selectedIds.has(enrolment.id) : false}
                        onToggleSelect={() => enrolment && toggleSelect(enrolment.id)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </div>
          </div>

          {/* Unassigned Campers */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-lg p-4 sticky top-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Unassigned Campers ({unassignedEnrolments.length})
              </h3>
              <div className="space-y-2">
                {unassignedEnrolments.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">All campers assigned</p>
                ) : (
                  unassignedEnrolments.map((enrolment) => (
                    <DraggableCamperCard
                      key={enrolment.id}
                      enrolment={enrolment}
                      isSelected={selectedIds.has(enrolment.id)}
                      onToggleSelect={() => toggleSelect(enrolment.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeEnrolment ? (
            <CamperCard
              enrolment={activeEnrolment}
              isSelected={selectedIds.has(activeEnrolment.id)}
              onToggleSelect={() => {}}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
