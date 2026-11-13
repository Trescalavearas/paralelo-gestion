"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";

import { NAVEGACION } from "@/config/navegacion";
import { salir } from "@/lib/acciones-auth";
import { cn } from "@/lib/utils";

type BarraLateralProps = {
  /** Selector de proyecto (componente de servidor). */
  selector?: React.ReactNode;
  /** Se llama al elegir un ítem (sirve para cerrar el menú en móvil). */
  alNavegar?: () => void;
  className?: string;
};

export function BarraLateral({ selector, alNavegar, className }: BarraLateralProps) {
  const ruta = usePathname();

  return (
    <nav aria-label="Navegación principal" className={cn("flex h-full flex-col gap-6", className)}>
      {selector}

      <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
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

      <div className="mt-auto flex flex-col gap-1">
        <Link
          href="/cambiar-clave"
          onClick={alNavegar}
          aria-current={ruta === "/cambiar-clave" ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
            ruta === "/cambiar-clave"
              ? "bg-nav-activo border-nav-activo-borde font-medium text-[#151515]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent",
          )}
        >
          <KeyRound
            className={cn("size-4 shrink-0", ruta === "/cambiar-clave" && "text-naranja")}
          />
          Cambiar mi contraseña
        </Link>
        <form action={salir}>
          <button
            type="submit"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors"
          >
            <LogOut className="size-4" />
            Salir
          </button>
        </form>
      </div>
    </nav>
  );
}
