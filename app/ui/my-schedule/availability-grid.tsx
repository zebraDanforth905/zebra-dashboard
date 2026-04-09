'use client';

import { saveMyAvailability } from '@/app/lib/actions';
import { StaffAvailabilityBlock, STAFF_SCHEDULE_WEEKDAYS } from '@/app/lib/staff-schedule-types';
import { useEffect, useMemo, useRef, useState } from 'react';

const START_HOUR = 7;
const END_HOUR = 21;

function makeSlotTimes() {
  const slots: string[] = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
    slots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return slots;
}

function buildAllSlotKeys(slotTimes: string[]) {
  const all = new Set<string>();
  for (const weekday of STAFF_SCHEDULE_WEEKDAYS) {
    for (const time of slotTimes) {
      all.add(`${weekday}|${time}`);
    }
  }
  return all;
}

function formatDisplayTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = minuteText ?? '00';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function expandBlocks(blocks: StaffAvailabilityBlock[]) {
  const selected = new Set<string>();
  for (const block of blocks) {
    let current = block.start_time.slice(0, 5);
    const end = block.end_time.slice(0, 5);
    while (current < end) {
      selected.add(`${block.weekday}|${current}`);
      const [hourText, minuteText] = current.split(':').map(Number);
      const total = hourText * 60 + minuteText + 30;
      current = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }
  }
  return selected;
}

function invertSelection(allKeys: Set<string>, selected: Set<string>) {
  const inverted = new Set<string>();
  for (const key of allKeys) {
    if (!selected.has(key)) inverted.add(key);
  }
  return inverted;
}

export default function AvailabilityGrid({ blocks }: { blocks: StaffAvailabilityBlock[] }) {
  const slotTimes = useMemo(() => makeSlotTimes(), []);
  const allSlotKeys = useMemo(() => buildAllSlotKeys(slotTimes), [slotTimes]);
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (blocks.length === 0) {
      // Default to fully available when no preference has been saved yet.
      return new Set<string>();
    }
    const availability = expandBlocks(blocks);
    return invertSelection(allSlotKeys, availability);
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isDraggingRef = useRef(false);
  const dragValueRef = useRef<boolean>(false);

  function setSlot(weekday: string, time: string, value: boolean) {
    const key = `${weekday}|${time}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function startDrag(weekday: string, time: string) {
    const key = `${weekday}|${time}`;
    const nextValue = !selected.has(key);
    isDraggingRef.current = true;
    dragValueRef.current = nextValue;
    setSlot(weekday, time, nextValue);
  }

  function dragOver(weekday: string, time: string) {
    if (!isDraggingRef.current) return;
    setSlot(weekday, time, dragValueRef.current);
  }

  useEffect(() => {
    function stopDrag() {
      isDraggingRef.current = false;
    }
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    return () => {
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setMessage(null);
    const availableSlots = invertSelection(allSlotKeys, selected);
    const slots = Array.from(availableSlots)
      .map((key) => {
        const [weekday, start_time] = key.split('|');
        return { weekday, start_time };
      })
      .sort((a, b) => {
        if (a.weekday !== b.weekday) return a.weekday.localeCompare(b.weekday);
        return a.start_time.localeCompare(b.start_time);
      });
    formData.set('slotsJson', JSON.stringify(slots));
    await saveMyAvailability(formData);
    setSaving(false);
    setMessage('Unavailability saved');
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Paint the 30-minute blocks when you are definitely unavailable each week.</p>
        {message ? <span className="text-xs font-medium text-emerald-700">{message}</span> : null}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-300 ring-1 ring-red-400" /> Unavailable</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-200" /> Available</span>
        <span>Click and drag to paint.</span>
      </div>

      <form action={handleSubmit}>
        <input type="hidden" name="slotsJson" value="[]" />
        <div className="overflow-x-auto select-none">
          <table className="min-w-[760px] table-fixed border-separate border-spacing-0 text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-16 border border-gray-200 bg-gray-50 px-1 py-1.5 text-left font-semibold text-gray-900">Time</th>
                {STAFF_SCHEDULE_WEEKDAYS.map((weekday) => (
                  <th key={weekday} className="border border-gray-200 bg-gray-50 px-1 py-1.5 text-center font-semibold text-gray-900">
                    {weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotTimes.map((time) => (
                <tr key={time}>
                  <td className="sticky left-0 z-10 border border-gray-200 bg-white px-1 py-1 font-medium text-gray-700">
                    {time.endsWith(':00') ? formatDisplayTime(time) : ''}
                  </td>
                  {STAFF_SCHEDULE_WEEKDAYS.map((weekday) => {
                    const key = `${weekday}|${time}`;
                    const active = selected.has(key);
                    return (
                      <td key={key} className="border border-gray-200 p-0">
                        <button
                          type="button"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            startDrag(weekday, time);
                          }}
                          onPointerEnter={() => dragOver(weekday, time)}
                          className={`h-5 w-full transition-colors ${active ? 'bg-red-300 hover:bg-red-400' : 'bg-emerald-100 hover:bg-emerald-200'}`}
                          aria-pressed={active}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <button disabled={saving} className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400">
            {saving ? 'Saving...' : 'Save Availability'}
          </button>
        </div>
      </form>
    </div>
  );
}
