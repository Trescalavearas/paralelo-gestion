import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Figura, Rol } from "@/lib/etiquetas";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const COOKIE_PROYECTO = "paralelo-proyecto";

export type ProyectoDelUsuario = {
  id: string;
  nombre: string;
  figura: Figura;
  moneda_base: "ARS" | "USD";
  rol: Rol;
  ve_libro_b: boolean;
};

export type Contexto = {
  usuarioId: string;
  proyectos: ProyectoDelUsuario[];
  /** Proyecto elegido en la barra lateral (o el primero). null si no tiene ninguno. */
  proyecto: ProyectoDelUsuario | null;
  permisos: {
    verMovimientos: boolean;
    registrar: boolean;
    administrar: boolean;
    verLibroB: boolean;
  };
};

type FilaMembresia = {
  rol: Rol;
  ve_libro_b: boolean;
  proyectos: { id: string; nombre: string; figura: Figura; moneda_base: "ARS" | "USD" } | null;
};

/** Usuario, sus proyectos y el proyecto activo. Una sola consulta por pedido. */
export const obtenerContexto = cache(async (): Promise<Contexto> => {
  const supabase = await crearClienteServidor();
  const { data: sesion } = await supabase.auth.getClaims();
  const usuarioId = sesion?.claims?.sub;
  if (!usuarioId) redirect("/ingresar");

  const { data } = await supabase
    .from("miembros")
    .select("rol, ve_libro_b, proyectos (id, nombre, figura, moneda_base)")
    .eq("usuario_id", usuarioId)
    .returns<FilaMembresia[]>();

  const proyectos: ProyectoDelUsuario[] = (data ?? [])
    .filter((m) => m.proyectos)
    .map((m) => ({ ...m.proyectos!, rol: m.rol, ve_libro_b: m.ve_libro_b }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const elegido = (await cookies()).get(COOKIE_PROYECTO)?.value;
  const proyecto = proyectos.find((p) => p.id === elegido) ?? proyectos[0] ?? null;
  const rol = proyecto?.rol;

  return {
    usuarioId,
    proyectos,
    proyecto,
    permisos: {
      verMovimientos:
        rol === "administrador" || rol === "contador" || rol === "direccion_obra" || rol === "lectura",
      registrar: rol === "administrador" || rol === "contador",
      administrar: rol === "administrador",
      verLibroB: Boolean(proyecto?.ve_libro_b),
    },
  };
});
