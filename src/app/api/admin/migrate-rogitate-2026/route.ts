import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { executeMigrateRogitate2026 } from "@/lib/resources/migrate-rogitate-2026";

export const maxDuration = 120;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Accesso riservato agli amministratori" },
      { status: 403 },
    );
  }

  try {
    const result = await executeMigrateRogitate2026();

    if (result.ok) {
      revalidatePath("/dashboard/rogitate");
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/applications");
      revalidatePath("/dashboard/settings");
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    console.error("API migrate-rogitate-2026 error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Errore interno migrazione",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Per comodità di verifica da admin
  return POST();
}
