export default function ApplicationLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-10 w-64 max-w-full rounded-lg bg-slate-200" />
      <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      <div className="h-40 rounded-xl border border-slate-200 bg-white" />
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white border border-slate-200" />
        ))}
      </div>
    </div>
  );
}
