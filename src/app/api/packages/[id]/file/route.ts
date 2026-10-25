import { NextRequest, NextResponse } from "next/server";
import { getPackageBundle } from "@/lib/package-bundle";
import { createPresignedGetUrl } from "@/lib/storage/blob";

export const maxDuration = 30;

/**
 * Anteprima singolo file pacchetto segreteria (token).
 * GET /api/packages/[id]/file?t=TOKEN&key=STORAGE_KEY
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t")?.trim();
  const key = req.nextUrl.searchParams.get("key")?.trim();
  if (!token || !key) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }

  const bundle = await getPackageBundle(id, token);
  if (bundle.status === "invalid" || bundle.status === "expired") {
    return new Response(JSON.stringify({ error: "Link scaduto o non valido" }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    });
  }

  const file = bundle.files.find((f) => f.storageKey === key);
  if (!file) {
    return NextResponse.json({ error: "File non nel pacchetto" }, { status: 404 });
  }

  try {
    const url = await createPresignedGetUrl(file.storageKey, 600, {
      fileName: file.name,
    });
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("package file presign failed", err);
    return NextResponse.json({ error: "Anteprima non disponibile" }, { status: 500 });
  }
}
