"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const onFocus = () => router.refresh(); // re-request RSC payload
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);
  return null;
}