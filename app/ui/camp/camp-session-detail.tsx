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
  amEnrolmentId: string | null;
  pmEnrolmentId: string | null;
  fdEnrolmentId: string | null;
};

type CamperCardProps = {
  enrolment: CampSessionWithEnrolments['enrolments'][0];
  isSelected: boolean;
  onToggleSelect: () => void;
  isDragging?: boolean;
  onUnassign?: () => void;
  showUnassign?: boolean;
};

function CamperCard({ enrolment, isSelected, onToggleSelect, isDragging = false, onUnassign, showUnassign = false }: CamperCardProps) {
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
      className={`relative bg-white border rounded-lg p-1.5 transition-all text-xs ${
        isDragging ? 'shadow-xl' : 'shadow-sm'
      } ${isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}
    >
      <div className="absolute top-1 right-1 flex gap-0.5">
        {showUnassign && onUnassign && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnassign();
            }}
            className="h-3 w-3 rounded bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center text-[10px] font-bold transition"
            title="Unassign from seat"
          >
            ×
          </button>
        )}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
      </div>

      <h3 className="font-semibold text-slate-900 text-xs mb-0.5 pr-6 truncate">
        {enrolment.student_name}
      </h3>

      <div className="space-y-0.5">
        <div className="flex items-center gap-0.5 text-[10px] text-slate-600">
          <CakeIcon className="h-2.5 w-2.5" />
          <span>{formatDOB(enrolment.dob)}</span>
        </div>

        <div className="flex flex-wrap gap-0.5">
          <span className={`px-1 py-0.5 text-[10px] font-medium rounded ${badge.color}`}>
            {badge.label}
          </span>
          {enrolment.extended_care && (
            <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700">
              Ext Care
            </span>
          )}
          {enrolment.course_id && (
            <span className="px-1 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
              {enrolment.course_id}
            </span>
          )}
        </div>

        {enrolment.special_needs && (
          <div className="mt-0.5 p-1 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
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

function SeatSpot({ 
  seat, 
  amEnrolment, 
  pmEnrolment, 
  fdEnrolment,
  selectedIds,
  onToggleSelect,
  onUnassign
}: { 
  seat: Seat; 
  amEnrolment: CampSessionWithEnrolments['enrolments'][0] | null;
  pmEnrolment: CampSessionWithEnrolments['enrolments'][0] | null;
  fdEnrolment: CampSessionWithEnrolments['enrolments'][0] | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onUnassign: (id: string) => void;
}) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: seat.id,
  });

  const {
    attributes: amAttributes,
    listeners: amListeners,
    setNodeRef: setAmSortableRef,
    transform: amTransform,
    transition: amTransition,
    isDragging: isAmDragging,
  } = useSortable({ 
    id: amEnrolment?.id || `empty-am-${seat.id}`,
    disabled: !amEnrolment,
  });

  const {
    attributes: pmAttributes,
    listeners: pmListeners,
    setNodeRef: setPmSortableRef,
    transform: pmTransform,
    transition: pmTransition,
    isDragging: isPmDragging,
  } = useSortable({ 
    id: pmEnrolment?.id || `empty-pm-${seat.id}`,
    disabled: !pmEnrolment,
  });

  const {
    attributes: fdAttributes,
    listeners: fdListeners,
    setNodeRef: setFdSortableRef,
    transform: fdTransform,
    transition: fdTransition,
    isDragging: isFdDragging,
  } = useSortable({ 
    id: fdEnrolment?.id || `empty-fd-${seat.id}`,
    disabled: !fdEnrolment,
  });

  const amStyle = {
    transform: CSS.Transform.toString(amTransform),
    transition: amTransition,
  };

  const pmStyle = {
    transform: CSS.Transform.toString(pmTransform),
    transition: pmTransition,
  };

  const fdStyle = {
    transform: CSS.Transform.toString(fdTransform),
    transition: fdTransition,
  };

  return (
    <div
      ref={setDroppableRef}
      className={`relative border border-dashed rounded p-1 min-h-[100px] transition-all ${
        isOver ? 'border-sky-500 bg-sky-50 scale-105' : 'border-slate-300 bg-slate-50'
      }`}
    >
      {fdEnrolment ? (
        <div ref={setFdSortableRef} style={fdStyle} className="cursor-move h-full" {...fdAttributes} {...fdListeners}>
          <CamperCard 
            enrolment={fdEnrolment} 
            isSelected={selectedIds.has(fdEnrolment.id)} 
            onToggleSelect={() => onToggleSelect(fdEnrolment.id)}
            isDragging={isFdDragging}
            showUnassign={true}
            onUnassign={() => onUnassign(fdEnrolment.id)}
          />
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* AM Half */}
          {amEnrolment ? (
            <div ref={setAmSortableRef} style={amStyle} className="cursor-move" {...amAttributes} {...amListeners}>
              <CamperCard 
                enrolment={amEnrolment} 
                isSelected={selectedIds.has(amEnrolment.id)} 
                onToggleSelect={() => onToggleSelect(amEnrolment.id)}
                isDragging={isAmDragging}
                showUnassign={true}
                onUnassign={() => onUnassign(amEnrolment.id)}
              />
            </div>
          ) : (
            <div className="h-8 flex items-center justify-center text-slate-400 text-[10px] border border-dashed border-slate-300 rounded bg-yellow-50/50">
              AM
            </div>
          )}

          {/* PM Half */}
          {pmEnrolment ? (
            <div ref={setPmSortableRef} style={pmStyle} className="cursor-move" {...pmAttributes} {...pmListeners}>
              <CamperCard 
                enrolment={pmEnrolment} 
                isSelected={selectedIds.has(pmEnrolment.id)} 
                onToggleSelect={() => onToggleSelect(pmEnrolment.id)}
                isDragging={isPmDragging}
                showUnassign={true}
                onUnassign={() => onUnassign(pmEnrolment.id)}
              />
            </div>
          ) : (
            <div className="h-8 flex items-center justify-center text-slate-400 text-[10px] border border-dashed border-slate-300 rounded bg-orange-50/50">
              PM
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CampSessionDetail({ session }: { session: CampSessionWithEnrolments }) {
  // Room configurations
  const ROOM_1_CONFIG = {
    name: 'Back Room',
    rows: 6,
    cols: 5,
    visibleSeats: new Set([4, 5, 9, 10, 19, 20, 24, 25, 1, 2, 6, 7, 11, 12, 16, 17, 21, 22, 26, 27]),
    seatOffset: 0 // Room 1 seats: 1-48
  };

  const ROOM_2_CONFIG = {
    name: 'Front Room',
    rows: 6,
    cols: 6,
    visibleSeats: new Set([3, 4, 7, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 33, 34]),
    seatOffset: 100 // Room 2 seats: 103-148
  };

  const [activeRoom, setActiveRoom] = useState<'room1' | 'room2'>('room1');
  const currentRoomConfig = activeRoom === 'room1' ? ROOM_1_CONFIG : ROOM_2_CONFIG;

  const { rows: ROWS, cols: COLS } = currentRoomConfig;
  
  // Determine which rows have at least one visible seat for current room
  const rowsWithSeats = new Set<number>();
  currentRoomConfig.visibleSeats.forEach(seatNum => {
    const row = Math.floor((seatNum - 1) / COLS);
    rowsWithSeats.add(row);
  });

  // Determine which columns have at least one visible seat for current room
  const colsWithSeats = new Set<number>();
  currentRoomConfig.visibleSeats.forEach(seatNum => {
    const col = ((seatNum - 1) % COLS);
    colsWithSeats.add(col);
  });

  const initializeSeatsForRoom = (roomConfig: typeof ROOM_1_CONFIG) => {
    const seats: Seat[] = [];
    for (let row = 0; row < roomConfig.rows; row++) {
      for (let col = 0; col < roomConfig.cols; col++) {
        const relativeSeatNumber = row * roomConfig.cols + col + 1;
        const absoluteSeatNumber = relativeSeatNumber + roomConfig.seatOffset;
        
        // Only create seats that should be visible for THIS room
        if (!roomConfig.visibleSeats.has(relativeSeatNumber)) continue;
        
        const amEnrolment = session.enrolments.find(e => e.assigned_seat_number === absoluteSeatNumber && e.camp_type === 'AM');
        const pmEnrolment = session.enrolments.find(e => e.assigned_seat_number === absoluteSeatNumber && e.camp_type === 'PM');
        const fdEnrolment = session.enrolments.find(e => e.assigned_seat_number === absoluteSeatNumber && e.camp_type === 'FD');
        
        seats.push({
          id: `seat-${absoluteSeatNumber}`,
          number: absoluteSeatNumber,
          row,
          col,
          amEnrolmentId: amEnrolment?.id || null,
          pmEnrolmentId: pmEnrolment?.id || null,
          fdEnrolmentId: fdEnrolment?.id || null,
        });
      }
    }
    return seats;
  };
  
  const [room1Seats, setRoom1Seats] = useState<Seat[]>(() => initializeSeatsForRoom(ROOM_1_CONFIG));
  const [room2Seats, setRoom2Seats] = useState<Seat[]>(() => initializeSeatsForRoom(ROOM_2_CONFIG));

  const seats = activeRoom === 'room1' ? room1Seats : room2Seats;
  const setSeats = activeRoom === 'room1' ? setRoom1Seats : setRoom2Seats;
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
  
  // Unassigned students are those not in ANY room
  const allSeats = [...room1Seats, ...room2Seats];
  const unassignedEnrolments = session.enrolments.filter(
    e => !allSeats.some(s => s.amEnrolmentId === e.id || s.pmEnrolmentId === e.id || s.fdEnrolmentId === e.id)
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

    // If dropping on itself, do nothing
    if (activeId === overId) return;

    // Get the enrolment being moved
    const movingEnrolment = enrolmentMap.get(activeId);
    if (!movingEnrolment) return;

    // Find if we're dragging from a seat
    const fromSeat = seats.find(s => 
      s.amEnrolmentId === activeId || s.pmEnrolmentId === activeId || s.fdEnrolmentId === activeId
    );
    
    // Find target seat - check if overId is a seat ID (seat-X format)
    let toSeat = seats.find(s => s.id === overId);
    
    // If not found, maybe we dropped on an enrolment that's in a seat
    if (!toSeat) {
      toSeat = seats.find(s => 
        s.amEnrolmentId === overId || s.pmEnrolmentId === overId || s.fdEnrolmentId === overId
      );
    }

    // If still not found, it's not a valid drop target
    if (!toSeat) {
      return;
    }

    // Determine the slot based on camp type
    const campType = movingEnrolment.camp_type;
    
    // Handle conflicts by swapping
    let displacedEnrolmentId: string | null = null;
    
    if (campType === 'FD') {
      // FD needs the whole seat - if occupied, swap with whoever is there
      if (toSeat.amEnrolmentId) displacedEnrolmentId = toSeat.amEnrolmentId;
      else if (toSeat.pmEnrolmentId) displacedEnrolmentId = toSeat.pmEnrolmentId;
      else if (toSeat.fdEnrolmentId) displacedEnrolmentId = toSeat.fdEnrolmentId;
    } else if (campType === 'AM') {
      // AM needs AM slot - swap with FD or AM if present
      if (toSeat.fdEnrolmentId) displacedEnrolmentId = toSeat.fdEnrolmentId;
      else if (toSeat.amEnrolmentId) displacedEnrolmentId = toSeat.amEnrolmentId;
    } else if (campType === 'PM') {
      // PM needs PM slot - swap with FD or PM if present
      if (toSeat.fdEnrolmentId) displacedEnrolmentId = toSeat.fdEnrolmentId;
      else if (toSeat.pmEnrolmentId) displacedEnrolmentId = toSeat.pmEnrolmentId;
    }

    // Create new seats array
    const newSeats = seats.map(seat => {
      // Clear from source seat and place displaced student if applicable
      if (fromSeat && seat.id === fromSeat.id) {
        if (campType === 'AM') {
          return { 
            ...seat, 
            amEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'AM' ? displacedEnrolmentId : null,
            pmEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'PM' ? displacedEnrolmentId : seat.pmEnrolmentId,
            fdEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'FD' ? displacedEnrolmentId : null
          };
        } else if (campType === 'PM') {
          return { 
            ...seat, 
            amEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'AM' ? displacedEnrolmentId : seat.amEnrolmentId,
            pmEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'PM' ? displacedEnrolmentId : null,
            fdEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'FD' ? displacedEnrolmentId : null
          };
        } else {
          return { 
            ...seat, 
            amEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'AM' ? displacedEnrolmentId : null,
            pmEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'PM' ? displacedEnrolmentId : null,
            fdEnrolmentId: displacedEnrolmentId && enrolmentMap.get(displacedEnrolmentId)?.camp_type === 'FD' ? displacedEnrolmentId : null
          };
        }
      }
      
      // Add to target seat
      if (seat.id === toSeat.id) {
        if (campType === 'AM') {
          return { ...seat, amEnrolmentId: activeId, fdEnrolmentId: null };
        } else if (campType === 'PM') {
          return { ...seat, pmEnrolmentId: activeId, fdEnrolmentId: null };
        } else {
          return { ...seat, fdEnrolmentId: activeId, amEnrolmentId: null, pmEnrolmentId: null };
        }
      }
      
      return seat;
    });

    setSeats(newSeats);

    // Update database for the moved enrolment
    await updateCampSeatAssignment(activeId, toSeat.number);
    
    // Update database for displaced enrolment if there was one
    if (displacedEnrolmentId && fromSeat) {
      await updateCampSeatAssignment(displacedEnrolmentId, fromSeat.number);
    } else if (displacedEnrolmentId && !fromSeat) {
      // Displaced from seat but moving student was unassigned, so clear the displaced one
      await updateCampSeatAssignment(displacedEnrolmentId, null);
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
    console.log(selectedIds);
    setIsCreatingSlips(true);

    const enrolments = session.enrolments
      .filter((e) => selectedIds.has(e.id));

    console.log(enrolments);
    const result = await createSlipsForCampers(enrolments);

    if (result.ok) {
     
      deselectAll();
    } else {
      alert(`Error: ${result.error}`);
    }
    setIsCreatingSlips(false);
  };

  const activeEnrolment = activeId ? enrolmentMap.get(activeId) : null;

  // Items for sortable context should be all enrolment IDs
  const allEnrolmentIds = session.enrolments.map(e => e.id);

  const handleUnassign = async (enrolmentId: string) => {
    const enrolment = enrolmentMap.get(enrolmentId);
    if (!enrolment) return;

    // Find which seat this enrolment is in (check both rooms)
    const seatInRoom1 = room1Seats.find(s => 
      s.amEnrolmentId === enrolmentId || s.pmEnrolmentId === enrolmentId || s.fdEnrolmentId === enrolmentId
    );
    const seatInRoom2 = room2Seats.find(s => 
      s.amEnrolmentId === enrolmentId || s.pmEnrolmentId === enrolmentId || s.fdEnrolmentId === enrolmentId
    );

    if (seatInRoom1) {
      // Remove from room 1
      setRoom1Seats(room1Seats.map(seat => {
        if (seat.id === seatInRoom1.id) {
          const newSeat = { ...seat };
          if (seat.amEnrolmentId === enrolmentId) newSeat.amEnrolmentId = null;
          if (seat.pmEnrolmentId === enrolmentId) newSeat.pmEnrolmentId = null;
          if (seat.fdEnrolmentId === enrolmentId) newSeat.fdEnrolmentId = null;
          return newSeat;
        }
        return seat;
      }));
    } else if (seatInRoom2) {
      // Remove from room 2
      setRoom2Seats(room2Seats.map(seat => {
        if (seat.id === seatInRoom2.id) {
          const newSeat = { ...seat };
          if (seat.amEnrolmentId === enrolmentId) newSeat.amEnrolmentId = null;
          if (seat.pmEnrolmentId === enrolmentId) newSeat.pmEnrolmentId = null;
          if (seat.fdEnrolmentId === enrolmentId) newSeat.fdEnrolmentId = null;
          return newSeat;
        }
        return seat;
      }));
    }

    // Update database to unassign
    await updateCampSeatAssignment(enrolmentId, null);
  };

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

      {/* Room Tabs */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveRoom('room1')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeRoom === 'room1'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {ROOM_1_CONFIG.name}
            <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-600">
              {room1Seats.filter(s => s.amEnrolmentId || s.pmEnrolmentId || s.fdEnrolmentId).length}
            </span>
          </button>
          <button
            onClick={() => setActiveRoom('room2')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition ${
              activeRoom === 'room2'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {ROOM_2_CONFIG.name}
            <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-600">
              {room2Seats.filter(s => s.amEnrolmentId || s.pmEnrolmentId || s.fdEnrolmentId).length}
            </span>
          </button>
        </nav>
      </div>

      <DndContext 
        sensors={sensors} 
        collisionDetection={closestCenter} 
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allEnrolmentIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Seating Area */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs">Room Layout</span>
                  <span className="text-xs text-slate-500">Front of Room →</span>
                </h3>
                <div 
                  className="grid gap-2" 
                  style={{ 
                    gridTemplateColumns: Array.from({ length: COLS }, (_, i) => 
                      colsWithSeats.has(i) ? 'minmax(0, 1fr)' : '1rem'
                    ).join(' '),
                    gridTemplateRows: Array.from({ length: ROWS }, (_, i) => 
                      rowsWithSeats.has(i) ? 'minmax(100px, auto)' : '0.75rem'
                    ).join(' ')
                  }}
                >
                  {Array.from({ length: ROWS * COLS }, (_, i) => {
                    const relativeSeatNumber = i + 1;
                    const absoluteSeatNumber = relativeSeatNumber + currentRoomConfig.seatOffset;
                    const row = Math.floor(i / COLS);
                    const seat = seats.find(s => s.number === absoluteSeatNumber);
                    
                    if (!seat) {
                      // Empty grid cell for non-visible seats
                      return <div key={`empty-${absoluteSeatNumber}`} />;
                    }
                    
                    const amEnrolment = seat.amEnrolmentId ? enrolmentMap.get(seat.amEnrolmentId) : null;
                    const pmEnrolment = seat.pmEnrolmentId ? enrolmentMap.get(seat.pmEnrolmentId) : null;
                    const fdEnrolment = seat.fdEnrolmentId ? enrolmentMap.get(seat.fdEnrolmentId) : null;
                    
                    return (
                      <SeatSpot
                        key={seat.id}
                        seat={seat}
                        amEnrolment={amEnrolment || null}
                        pmEnrolment={pmEnrolment || null}
                        fdEnrolment={fdEnrolment || null}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onUnassign={handleUnassign}
                      />
                    );
                  })}
                </div>
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
        </SortableContext>

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
