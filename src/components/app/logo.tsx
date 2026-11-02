"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  /** "logotipo" = logo completo (ingreso); "isotipo" = símbolo (barra lateral). */
  variante?: "logotipo" | "isotipo";
  className?: string;
  ancho?: number;
  alto?: number;
};

const ARCHIVOS = {
  logotipo: "/paralelo-logotipo.png",
  isotipo: "/paralelo-isotipo.png",
} as const;

/**
 * Muestra el logo desde /public. Si el archivo todavía no está subido,
 * cae a un texto ("Paralelo" o "P") para que la pantalla no se vea rota.
 */
export function Logo({ variante = "logotipo", className, ancho, alto }: LogoProps) {
  const [fallo, setFallo] = useState(false);
  const esIsotipo = variante === "isotipo";
  const w = ancho ?? (esIsotipo ? 36 : 220);
  const h = alto ?? (esIsotipo ? 36 : 64);

  if (fallo) {
    return esIsotipo ? (
      <span
        className={cn(
          "bg-primary text-primary-foreground flex shrink-0 items-center justify-center rounded-xl text-base font-semibold",
          className,
        )}
        style={{ width: w, height: h }}
        aria-label="Paralelo"
      >
        P
      </span>
    ) : (
      <span
        className={cn("text-3xl font-semibold tracking-tight text-[#151515]", className)}
        aria-label="Paralelo"
      >
        Paralelo
      </span>
    );
  }

  return (
    <Image
      src={ARCHIVOS[variante]}
      alt="Paralelo"
      width={w}
      height={h}
      priority={!esIsotipo}
      className={cn("h-auto object-contain", esIsotipo && "rounded-xl", className)}
      onError={() => setFallo(true)}
    />
  );
}
