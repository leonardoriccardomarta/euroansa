export function SchemaBanner({ error }: { error: string }) {
  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-semibold">Database non aggiornato</p>
      <p className="mt-1 text-red-800">
        Manca una colonna o tabella dopo il deploy. Esegui il setup oppure
        ricarica la dashboard (auto-migrazione al boot).
      </p>
      <p className="mt-2 font-mono text-xs text-red-700">{error}</p>
    </div>
  );
}
