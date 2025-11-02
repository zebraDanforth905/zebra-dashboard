import Link from "next/link";
import clsx from "clsx";

export function ClickableRow({
  href,
  children,
  active,
  className,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <tr className={className || clsx(
      "relative cursor-pointer",
      active ? "bg-sky-50" : "hover:bg-slate-50"
    )}>
      {/* “overlay” link */}
      <td
        className="absolute inset-0 z-[1]"
        colSpan={999} // ensure it covers the whole row
      >
        <Link href={href} className="block w-full h-full" />
      </td>

      {children}
    </tr>
  );
}
