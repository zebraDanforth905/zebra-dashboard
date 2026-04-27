export default function Loading() {
  return (
    <div className="m-3 md:m-6 animate-pulse">
      <div className="h-8 w-56 bg-slate-200 rounded mb-2" />
      <div className="h-4 w-80 bg-slate-100 rounded mb-6" />
      <div className="h-10 w-full bg-slate-100 rounded mb-6" />
      <div className="flex gap-3 mb-4">
        <div className="h-9 w-44 bg-slate-200 rounded-lg" />
        <div className="h-9 w-28 bg-slate-100 rounded-lg" />
      </div>
      <div className="h-64 w-full bg-slate-100 rounded-xl" />
    </div>
  );
}
