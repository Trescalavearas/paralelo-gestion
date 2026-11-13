import Link from "next/link";
import { FolderOpen, Lock } from "lucide-react";

function Tarjeta({ icono, titulo, texto, children }: {
  icono: React.ReactNode;
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[22px] border border-black/5 bg-white p-10 text-center">
      <span className="bg-nav-activo text-naranja flex size-12 items-center justify-center rounded-2xl">
        {icono}
      </span>
      <p className="font-medium">{titulo}</p>
      <p className="text-muted-foreground max-w-sm text-sm">{texto}</p>
      {children}
    </div>
  );
}

export function SinProyecto() {
  return (
    <Tarjeta
      icono={<FolderOpen className="size-5" />}
      titulo="Todavía no tenés proyectos asignados"
      texto="Cuando un administrador te sume a un proyecto, vas a poder trabajar acá."
    />
  );
}

export function SinPermiso({ texto }: { texto?: string }) {
  return (
    <Tarjeta
      icono={<Lock className="size-5" />}
      titulo="No tenés acceso a esta sección"
      texto={texto ?? "Tu rol en este proyecto no incluye esta sección. Si lo necesitás, pedíselo a un administrador."}
    >
      <Link href="/tablero" className="text-sm underline underline-offset-4">
        Volver al tablero
      </Link>
    </Tarjeta>
  );
}

export function Cargando({ alto = 320 }: { alto?: number }) {
  return (
    <div
      className="animate-pulse rounded-[22px] border border-black/5 bg-white/70"
      style={{ height: alto }}
      aria-busy="true"
      aria-label="Cargando"
    />
  );
}

/** Chip de libro: A en negro, B en naranja. */
export function ChipLibro({ libro }: { libro: "A" | "B" | "AB" }) {
  if (libro === "AB") {
    return (
      <span className="inline-flex items-center gap-0.5">
        <ChipLibro libro="A" />
        <ChipLibro libro="B" />
      </span>
    );
  }
  return (
    <span
      className={
        libro === "A"
          ? "bg-libro-a inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
          : "bg-libro-b inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      }
    >
      {libro}
    </span>
  );
}

export function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <Tarjeta icono={<FolderOpen className="size-5" />} titulo={titulo} texto={texto}>
      {children}
    </Tarjeta>
  );
}
