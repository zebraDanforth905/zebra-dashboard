import React from "react";
import Image from "next/image"
import Link from "next/link"
import { Metadata } from "next";

// Simple, on-brand landing page matching the dashboard's blue→teal gradient,
// rounded cards, and soft shadows. Swap /public/zebra-logo.svg to your logo file.
// Wire the login buttons later (e.g., router.push('/login') or <Link href="/login" />).

export const metadata: Metadata = {
  title: {template: '%s | Zebra DanforthDashboard', default: 'Zebra Danforth Dashboard'},
  description: ''
};

export default function Page() {
  const handleLogin = () => {
    // TODO: replace with your real login route
    // e.g., router.push('/login')
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top gradient banner to match app theme */}
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500">
        {/* soft pattern blob */}
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <div className="absolute -top-32 left-1/3 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        </div>

        {/* Nav */}
        <header className="mx-auto max-w-7xl px-6 py-5">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image 
              src="/zebra-logo.png" 
              alt="Zebra Robotics" 
              width={600}
              height={200}
              className=""/>
            </div>

            <div className="flex items-center gap-3">
              {/* future search or location pills could go here */}
              <Link
                href="/login">
                  <button
                    className="rounded-full bg-white px-5 py-2 text-sky-700 font-medium shadow shadow-sky-900/10 hover:bg-slate-100 active:scale-[0.99] transition"
                  >
                    Log in
                  </button>
              </Link>
              
            </div>
          </nav>
        </header>

        {/* Hero */}
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-8 lg:pb-28 lg:pt-10">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl/tight font-semibold text-white drop-shadow">
              Danforth Administrative Dashboard
            </h1>
            <p className="mt-3 text-white/90 max-w-prose">
              enrollments, reports, and day‑to‑day operations.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full bg-white px-6 py-3 text-sky-700 font-medium shadow-lg shadow-sky-900/20 hover:bg-slate-100 active:scale-[0.99] transition"
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Minimal sections */}
      <main className="mx-auto max-w-7xl px-6 -mt-10 pb-20">
        {/* Preview card that echoes your app's rounded panels */}
        <section className="rounded-2xl bg-white shadow-xl shadow-sky-900/5 ring-1 ring-slate-200 p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl bg-orange-50 ring-1 ring-orange-100 p-5">
              <div className="text-sm font-semibold text-slate-700"></div>
              <p className="mt-1 text-slate-500 text-sm"></p>
            </div>
            <div className="rounded-xl bg-sky-50 ring-1 ring-sky-100 p-5">
              <div className="text-sm font-semibold text-slate-700"></div>
              <p className="mt-1 text-slate-500 text-sm"></p>
            </div>
            <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-5">
              <div className="text-sm font-semibold text-slate-700"></div>
              <p className="mt-1 text-slate-500 text-sm"></p>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-xl shadow-emerald-900/5">
            <h2 className="text-lg font-semibold text-slate-800"></h2>
            <p className="mt-2 text-slate-600">
              
            </p>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-xl shadow-sky-900/5">
            <h2 className="text-lg font-semibold text-slate-800"></h2>
            <ul className="mt-2 text-slate-600 list-disc pl-5 space-y-1">

            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-8 flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Image src="/zebra-logo.png" alt="Zebra Robotics" height={100} width={200}/>
            <span>© 2025 Zebra Robotics</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="hover:text-slate-700">Log in</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
