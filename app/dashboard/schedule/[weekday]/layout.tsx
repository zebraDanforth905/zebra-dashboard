// app/dashboard/schedule/[weekday]/layout.tsx
import type { ReactNode } from "react";

export default async function DayLayout({
  children,
}: {
  children: ReactNode;
}) {
    return (
      <div className="space-y-3">
        {children}
      </div>
    );
}
