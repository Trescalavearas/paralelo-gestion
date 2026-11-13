"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { COOKIE_PROYECTO, obtenerContexto } from "@/lib/contexto";

/** Cambia el proyecto activo (solo entre los proyectos del usuario). */
export async function elegirProyecto(proyectoId: string) {
  const { proyectos } = await obtenerContexto();
  if (!proyectos.some((p) => p.id === proyectoId)) return;

  (await cookies()).set(COOKIE_PROYECTO, proyectoId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
