export default function FilesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-9 w-48 max-w-full rounded-lg bg-slate-200" />
      <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
