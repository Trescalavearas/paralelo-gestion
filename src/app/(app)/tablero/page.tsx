import type { Metadata } from "next";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { PROYECTO_ACTUAL } from "@/config/navegacion";

export const metadata: Metadata = { title: "Tablero" };

/**
 * Tablero — fase 0: solo la estructura visual.
 * Ningún número es real: todas las tarjetas muestran "Sin datos" hasta
 * que haya base de datos y autenticación (fase 1).
 */
const INDICADORES = [
  { titulo: "Saldo", libro: "A" as const, detalle: "ARS · USD" },
  { titulo: "Saldo", libro: "B" as const, detalle: "ARS · USD" },
  { titulo: "Avance de obra", detalle: "Real vs. presupuesto" },
  { titulo: "Cobranzas", detalle: "Cuotas cobradas y pendientes" },
];

export default function PaginaTablero() {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Tablero"
        descripcion={`Resumen de ${PROYECTO_ACTUAL.nombre}.`}
      />

      {/* Panel destacado */}
      <section className="bg-durazno flex min-h-[180px] flex-col justify-end rounded-[22px] p-6 sm:p-8">
        <p className="text-sm font-medium text-[#151515]/70">{PROYECTO_ACTUAL.tipo}</p>
        <p className="text-2xl font-semibold tracking-tight text-[#151515] sm:text-3xl">
          {PROYECTO_ACTUAL.nombre}
        </p>
        <p className="mt-1 text-sm text-[#151515]/70">
          Los indicadores se van a completar cuando se carguen datos.
        </p>
      </section>

      {/* Indicadores (vacíos) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {INDICADORES.map((ind) => (
          <article
            key={`${ind.titulo}-${ind.libro ?? ""}`}
            className="flex flex-col gap-4 rounded-[20px] border border-black/5 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{ind.titulo}</h2>
              {ind.libro ? <ChipLibro libro={ind.libro} /> : null}
            </div>
            <p className="text-muted-foreground font-mono text-2xl">—</p>
            <p className="text-muted-foreground text-xs">
              {ind.detalle} · <span className="italic">Sin datos</span>
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <PanelVacio titulo="Últimos movimientos" className="lg:col-span-2" />
        <PanelVacio titulo="Tareas pendientes" />
      </section>
    </div>
  );
}

function ChipLibro({ libro }: { libro: "A" | "B" }) {
  return (
    <span
      className={
        libro === "A"
          ? "bg-libro-a rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
          : "bg-libro-b rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
      }
    >
      Libro {libro}
    </span>
  );
}

function PanelVacio({ titulo, className }: { titulo: string; className?: string }) {
  return (
    <article
      className={`flex min-h-[220px] flex-col gap-3 rounded-[22px] border border-black/5 bg-white p-6 ${className ?? ""}`}
    >
      <h2 className="text-sm font-medium">{titulo}</h2>
      <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-2xl border border-dashed text-sm">
        Sin datos todavía
      </div>
    </article>
  );
}
