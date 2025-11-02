"use client";

export default function OptionsBar() {
  // Placeholder controls — wire up later
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-sm font-medium text-slate-700 mr-2">Options</div>

      <button
        type="button"
        disabled
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600
                   hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
        title="Coming soon"
      >
        Filter
      </button>

      <button
        type="button"
        disabled
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600
                   hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
        title="Coming soon"
      >
        Sort
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-500">View:</span>
        <div className="inline-flex rounded-xl border border-slate-200 p-1">
          <button
            type="button"
            disabled
            className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="List (coming soon)"
          >
            List
          </button>
          <button
            type="button"
            disabled
            className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            title="Cards (coming soon)"
          >
            Cards
          </button>
        </div>
      </div>
    </div>
  );
}
