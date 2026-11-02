"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { Logo } from "@/components/app/logo";
import { NAVEGACION, PROYECTO_ACTUAL } from "@/config/navegacion";
import { cn } from "@/lib/utils";

type BarraLateralProps = {
  /** Se llama al elegir un ítem (sirve para cerrar el menú en móvil). */
  alNavegar?: () => void;
  className?: string;
};

export function BarraLateral({ alNavegar, className }: BarraLateralProps) {
  const ruta = usePathname();

  return (
    <nav aria-label="Navegación principal" className={cn("flex h-full flex-col gap-6", className)}>
      {/* Selector de proyecto (estático en la fase 0) */}
      <button
        type="button"
        className="hover:bg-muted flex w-full cursor-default items-center gap-3 rounded-2xl border border-black/5 p-2.5 text-left transition-colors"
        aria-label={`Proyecto actual: ${PROYECTO_ACTUAL.nombre}`}
      >
        <Logo variante="isotipo" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{PROYECTO_ACTUAL.nombre}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {PROYECTO_ACTUAL.tipo}
          </span>
        </span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </button>

      <ul className="flex flex-col gap-1">
        {NAVEGACION.map((item) => {
          const activo = ruta === item.ruta || ruta.startsWith(`${item.ruta}/`);
          const Icono = item.icono;
          return (
            <li key={item.ruta}>
              <Link
                href={item.ruta}
                onClick={alNavegar}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                  activo
                    ? "bg-nav-activo border-nav-activo-borde font-medium text-[#151515]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent",
                )}
              >
                <Icono className={cn("size-4 shrink-0", activo && "text-naranja")} />
                {item.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto">
        <Link
          href="/ingresar"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors"
        >
          <LogOut className="size-4" />
          Salir
        </Link>
      </div>
    </nav>
  );
}
