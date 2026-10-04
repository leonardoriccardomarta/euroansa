export default function FileBrowserLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-9 w-56 max-w-full rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    </div>
  );
}
