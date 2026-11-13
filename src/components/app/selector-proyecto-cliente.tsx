"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

import { Logo } from "@/components/app/logo";
import {
  DropdownMenu,
  DropdownMenuCheckIndicator,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { elegirProyecto } from "@/lib/acciones-proyecto";
import { cn } from "@/lib/utils";

type Opcion = { id: string; nombre: string; figura: string };

export function SelectorProyectoCliente({
  proyectos,
  activoId,
}: {
  proyectos: Opcion[];
  activoId: string | null;
}) {
  const router = useRouter();
  const [cambiando, startTransition] = useTransition();
  const activo = proyectos.find((p) => p.id === activoId);

  const contenido = (
    <>
      <Logo variante="isotipo" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {activo?.nombre ?? "Sin proyectos"}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {activo?.figura ?? "Pedí acceso a un administrador"}
        </span>
      </span>
    </>
  );

  const clases =
    "flex w-full items-center gap-3 rounded-2xl border border-black/5 p-2.5 text-left transition-colors";

  if (proyectos.length <= 1) {
    return <div className={clases}>{contenido}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(clases, "hover:bg-muted cursor-pointer", cambiando && "opacity-60")}
        aria-label={`Proyecto actual: ${activo?.nombre ?? "ninguno"}. Cambiar de proyecto`}
      >
        {contenido}
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Proyectos</DropdownMenuLabel>
        {proyectos.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() =>
              startTransition(async () => {
                await elegirProyecto(p.id);
                router.refresh();
              })
            }
          >
            <span className="min-w-0">
              <span className="block truncate">{p.nombre}</span>
              <span className="text-muted-foreground block truncate text-xs">{p.figura}</span>
            </span>
            <DropdownMenuCheckIndicator visible={p.id === activoId} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
