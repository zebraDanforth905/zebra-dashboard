'use client';

import React, { useState } from "react";
import Image from "next/image"

import { useActionState } from 'react';
import { authenticate } from '@/app/login/actions';
import { useSearchParams } from 'next/navigation';



// Themed login form matching Zebra Robotics dashboard aesthetic
export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  
  
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-sky-600 via-sky-600 to-emerald-500 text-slate-800">
      <div className="relative w-full max-w-md p-8 bg-white/90 backdrop-blur rounded-2xl shadow-2xl ring-1 ring-slate-200">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/favicon.ico"
            alt="Zebra Robotics Logo"
            width={100}
            height={100}
            className="h-12 w-12 mb-3 rounded-full bg-sky-100 p-2"
          />
          <h1 className="text-2xl font-semibold text-slate-800">Sign In</h1>
          <p className="text-sm text-slate-500">Access your Zebra Robotics dashboard</p>
        </div>

        <form action={formAction} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
            />
          </div>

          {errorMessage && <p className="text-sm text-red-600 text-center">{errorMessage}</p>}
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <button aria-disabled={isPending}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-white font-medium shadow-lg shadow-sky-900/20 hover:bg-sky-500 active:scale-[0.99] transition"
          >
            Log In
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Forgot your password? <a href="#" className="text-sky-600 hover:underline">Reset it</a></p>
        </div>
      </div>
    </div>
  );
}