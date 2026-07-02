import type { ReactNode } from 'react';

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
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'days', label: 'Camp Days' },
    ...(slips != null ? [{ key: 'slips' as const, label: 'Slips' }] : []),
    { key: 'prep', label: 'Account & Device Prep' },
    { key: 'lms', label: 'LMS Checklist' },
    ...(schedule != null ? [{ key: 'schedule' as const, label: 'Activity Schedule' }] : []),
    ...(staffSchedule != null ? [{ key: 'staff' as const, label: 'Staff Schedule' }] : []),
    ...(printLog != null ? [{ key: 'printLog' as const, label: '3D Print Log' }] : []),
  ];

  return (
    <div className="camp-week-tabs">
      {tabs.map((tab, index) => (
        <input
          key={tab.key}
          type="radio"
          name="camp-week-tab"
          id={`camp-week-tab-${tab.key}`}
          defaultChecked={index === 0}
          className="sr-only"
        />
      ))}

      <div className="mb-4 border-b border-slate-200">
        <nav className="camp-week-nav -mb-px flex flex-wrap gap-x-8 gap-y-1" aria-label="Camp week sections">
          {tabs.map((tab) => (
            <label
              key={tab.key}
              htmlFor={`camp-week-tab-${tab.key}`}
              className="camp-week-tab-label whitespace-nowrap py-3 px-1 border-b-2 border-transparent font-medium text-sm text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
            >
              {tab.label}
            </label>
          ))}
        </nav>
      </div>

      <div className="camp-week-panel camp-week-panel-days">{campDays}</div>
      {slips != null ? (
        <div className="camp-week-panel camp-week-panel-slips">{slips}</div>
      ) : null}
      <div className="camp-week-panel camp-week-panel-prep">{accountPrep}</div>
      <div className="camp-week-panel camp-week-panel-lms">{lms}</div>
      {schedule != null ? (
        <div className="camp-week-panel camp-week-panel-schedule">{schedule}</div>
      ) : null}
      {staffSchedule != null ? (
        <div className="camp-week-panel camp-week-panel-staff">{staffSchedule}</div>
      ) : null}
      {printLog != null ? (
        <div className="camp-week-panel camp-week-panel-printLog">{printLog}</div>
      ) : null}

      <style>{`
        .camp-week-tabs .camp-week-panel {
          display: none;
        }

        #camp-week-tab-days:checked ~ .camp-week-panel-days,
        #camp-week-tab-slips:checked ~ .camp-week-panel-slips,
        #camp-week-tab-prep:checked ~ .camp-week-panel-prep,
        #camp-week-tab-lms:checked ~ .camp-week-panel-lms,
        #camp-week-tab-schedule:checked ~ .camp-week-panel-schedule,
        #camp-week-tab-staff:checked ~ .camp-week-panel-staff,
        #camp-week-tab-printLog:checked ~ .camp-week-panel-printLog {
          display: block;
        }

        #camp-week-tab-days:checked ~ div .camp-week-nav label[for="camp-week-tab-days"],
        #camp-week-tab-slips:checked ~ div .camp-week-nav label[for="camp-week-tab-slips"],
        #camp-week-tab-prep:checked ~ div .camp-week-nav label[for="camp-week-tab-prep"],
        #camp-week-tab-lms:checked ~ div .camp-week-nav label[for="camp-week-tab-lms"],
        #camp-week-tab-schedule:checked ~ div .camp-week-nav label[for="camp-week-tab-schedule"],
        #camp-week-tab-staff:checked ~ div .camp-week-nav label[for="camp-week-tab-staff"],
        #camp-week-tab-printLog:checked ~ div .camp-week-nav label[for="camp-week-tab-printLog"] {
          border-color: rgb(14 165 233);
          color: rgb(2 132 199);
        }
      `}</style>
    </div>
  );
}
