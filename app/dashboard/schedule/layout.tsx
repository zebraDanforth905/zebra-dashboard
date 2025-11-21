// app/(protected)/schedule/daily/layout.tsx
import type { ReactNode } from "react";
import DailyNav from "@/app/ui/schedule/daily-nav";
import OptionsBar from "@/app/ui/schedule/options-bar";
import AutoRefreshOnFocus from "@/app/ui/auto-refresh-on-focus";


export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Gradient header */}
      <header className="relative overflow-hidden">
        <div className="h-16 md:h-24 bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500" />
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute -top-10 left-16 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
          <div className="absolute -bottom-10 right-16 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
        </div>
        <div className="absolute inset-0 flex items-end">
          <div className="container mx-auto px-3 md:px-4 pb-2 md:pb-3">
            <h1 className="text-white/95 text-lg md:text-xl font-semibold drop-shadow-sm">
              Daily Schedule
            </h1>
          </div>
        </div>
      </header>

      {/* Nav + Options */}
      <div className="container mx-auto px-3 md:px-4 space-y-3 mt-3">
        <div className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-2">
          <DailyNav />
        </div>
      </div>

      {/* Page content */}
      <main className="container mx-auto px-3 md:px-4 py-4 md:py-6">
        <div className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 p-3 md:p-4">
          {children}
        </div>
      </main>
    </div>
  );
}
