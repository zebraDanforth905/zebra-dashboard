'use client';

import { useState, type ReactNode } from 'react';

type TabKey = 'days' | 'slips' | 'prep' | 'lms' | 'schedule' | 'staff' | 'printLog';

export default function CampWeekTabs({
  campDays,
  slips,
  accountPrep,
  lms,
  schedule,
  staffSchedule,
  printLog,
}: {
  campDays: ReactNode;
  slips?: ReactNode;
  accountPrep: ReactNode;
  lms: ReactNode;
  schedule?: ReactNode;
  staffSchedule?: ReactNode;
  printLog?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('days');

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'days', label: 'Camp Days' },
    ...(slips != null ? [{ key: 'slips' as const, label: 'Slips' }] : []),
    { key: 'prep', label: 'Account & Device Prep' },
    { key: 'lms', label: 'LMS Checklist' },
    ...(schedule != null ? [{ key: 'schedule' as const, label: 'Activity Schedule' }] : []),
    ...(staffSchedule != null ? [{ key: 'staff' as const, label: 'Staff Schedule' }] : []),
    ...(printLog != null ? [{ key: 'printLog' as const, label: '3D Print Log' }] : []),
  ];

  const tabClass = (tab: TabKey) =>
    `whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition ${
      activeTab === tab
        ? 'border-sky-500 text-sky-600'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
    }`;

  return (
    <div>
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-x-8 gap-y-1" aria-label="Camp week sections">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={tabClass(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Keep every panel mounted so in-tab state survives tab switches. */}
      <div className={activeTab === 'days' ? '' : 'hidden'}>{campDays}</div>
      {slips != null ? (
        <div className={activeTab === 'slips' ? '' : 'hidden'}>{slips}</div>
      ) : null}
      <div className={activeTab === 'prep' ? '' : 'hidden'}>{accountPrep}</div>
      <div className={activeTab === 'lms' ? '' : 'hidden'}>{lms}</div>
      {schedule != null ? (
        <div className={activeTab === 'schedule' ? '' : 'hidden'}>{schedule}</div>
      ) : null}
      {staffSchedule != null ? (
        <div className={activeTab === 'staff' ? '' : 'hidden'}>{staffSchedule}</div>
      ) : null}
      {printLog != null ? (
        <div className={activeTab === 'printLog' ? '' : 'hidden'}>{printLog}</div>
      ) : null}
    </div>
  );
}
