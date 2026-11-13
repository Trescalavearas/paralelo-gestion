import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { ESTADOS_PROYECTO, FIGURAS, ROLES, type EstadoProyecto, type Figura, type Rol } from "@/lib/etiquetas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tablero" };

type FilaMembresia = {
  rol: Rol;
  ve_libro_b: boolean;
  proyectos: {
    id: string;
    nombre: string;
    figura: Figura;
    moneda_base: "ARS" | "USD";
    estado: EstadoProyecto;
  } | null;
};

export default function PaginaTablero() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<EsqueletoTablero />}>
        <ContenidoTablero />
      </Suspense>
    </div>
  );
}

async function ContenidoTablero() {
  const supabase = await crearClienteServidor();
  const { data: sesion } = await supabase.auth.getClaims();
  const usuarioId = sesion?.claims?.sub;
  if (!usuarioId) redirect("/ingresar");

  const [{ data: perfil }, { data: membresias, error }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("id", usuarioId).maybeSingle(),
    supabase
      .from("miembros")
      .select("rol, ve_libro_b, proyectos (id, nombre, figura, moneda_base, estado)")
      .eq("usuario_id", usuarioId)
      .returns<FilaMembresia[]>(),
  ]);

  const nombre = perfil?.nombre || (sesion?.claims?.email as string | undefined) || "";
  const proyectos = (membresias ?? [])
    .filter((m): m is FilaMembresia & { proyectos: NonNullable<FilaMembresia["proyectos"]> } =>
      Boolean(m.proyectos),
    )
    .sort((a, b) => a.proyectos.nombre.localeCompare(b.proyectos.nombre, "es"));

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>
        <p className="text-muted-foreground text-sm">
          Hola{nombre ? `, ${nombre}` : ""}.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Tus proyectos</h2>

        {error ? (
          <div className="rounded-[22px] border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            No se pudieron cargar los proyectos. Probá recargar la página.
          </div>
        ) : proyectos.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[22px] border border-black/5 bg-white p-10 text-center">
            <span className="bg-nav-activo text-naranja flex size-12 items-center justify-center rounded-2xl">
              <FolderOpen className="size-5" />
            </span>
            <p className="font-medium">Todavía no tenés proyectos asignados</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Cuando un administrador te sume a un proyecto, va a aparecer acá.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {proyectos.map(({ proyectos: p, rol, ve_libro_b }, i) => (
              <li
                key={p.id}
                className={cn(
                  "flex min-h-[170px] flex-col justify-between gap-6 rounded-[22px] border border-black/5 p-6",
                  i === 0 ? "bg-durazno" : "bg-white",
                )}
              >
                <div className="space-y-1">
                  <p className="text-sm text-[#151515]/70">{FIGURAS[p.figura]}</p>
                  <p className="text-xl font-semibold tracking-tight">{p.nombre}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Chip>{ESTADOS_PROYECTO[p.estado]}</Chip>
                  <Chip>{ROLES[rol]}</Chip>
                  <Chip className="font-mono">{p.moneda_base}</Chip>
                  {ve_libro_b ? (
                    <Chip className="bg-libro-b border-transparent text-white">Libro B</Chip>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full border border-black/10 bg-white/80 px-2.5 py-0.5", className)}>
      {children}
    </span>
  );
}

function EsqueletoTablero() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-black/5" />
        <div className="h-4 w-48 animate-pulse rounded-lg bg-black/5" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-[170px] animate-pulse rounded-[22px] bg-white" />
        <div className="h-[170px] animate-pulse rounded-[22px] bg-white" />
      </div>
    </div>
  );
}
