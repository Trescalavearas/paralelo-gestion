import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, FileSpreadsheet, Plus } from "lucide-react";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, ChipLibro, SinPermiso, SinProyecto } from "@/components/app/estados";
import { BotonAnular } from "@/components/contabilidad/boton-anular";
import { Panel } from "@/components/contabilidad/campos";
import { FiltrosDeMovimientos } from "@/components/contabilidad/filtros-movimientos";
import { Button } from "@/components/ui/button";
import {
  buscarMovimientos,
  cargarCuentas,
  filtrosAQuery,
  leerFiltros,
  LIMITE_MOVIMIENTOS,
  type FilaMovimiento,
} from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearNumero, formatearTC } from "@/lib/formato";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimientos" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaMovimientos({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Movimientos"
        descripcion="Asientos en libros A y B, en pesos y en dólares."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const TIPOS: Record<string, string> = {
  pago: "Pago",
  cobro: "Cobro",
  traspaso_cajas: "Traspaso entre cajas",
  traspaso_libros: "Traspaso entre libros",
  ajuste: "Ajuste",
  manual: "Manual",
};

async function Contenido({ searchParams }: Props) {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  if (!permisos.verMovimientos) {
    return <SinPermiso texto="Con el rol comercial todavía no se ven los movimientos." />;
  }

  const params = await searchParams;
  const filtros = leerFiltros(params, permisos.verLibroB);
  const cuentas = await cargarCuentas(proyecto.id);
  const { filas, total, error } = await buscarMovimientos(proyecto.id, filtros, cuentas);
  const recortado = total > filas.length;
  const registrado = typeof params.registrado === "string" ? params.registrado : null;

  // Agrupar por asiento, respetando el orden.
  const asientos: { id: string; filas: FilaMovimiento[] }[] = [];
  for (const f of filas) {
    const ultimo = asientos.at(-1);
    if (ultimo?.id === f.asiento_id) ultimo.filas.push(f);
    else asientos.push({ id: f.asiento_id, filas: [f] });
  }

  const columna = filtros.moneda === "USD" ? "neto_usd" : "neto_ars";
  const totalDebe = filas.reduce((s, f) => s + Math.max(Number(f[columna]), 0), 0);
  const totalHaber = filas.reduce((s, f) => s + Math.max(-Number(f[columna]), 0), 0);
  const consulta = filtrosAQuery(filtros);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {permisos.registrar ? (
          <Button asChild>
            <Link href="/movimientos/nuevo">
              <Plus />
              Nuevo asiento
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="bg-white">
          <a href={`/movimientos/exportar?${consulta}`}>
            <FileSpreadsheet />
            Exportar a Excel
          </a>
        </Button>
        <Button asChild variant="outline" className="bg-white">
          <Link href="/movimientos/cierres">
            <CalendarCheck />
            Cierres de mes
          </Link>
        </Button>
      </div>

      {registrado ? (
        <p role="status" className="border-nav-activo-borde bg-nav-activo rounded-xl border px-3.5 py-2.5 text-sm">
          Se registró el asiento N° {registrado}.
        </p>
      ) : null}

      <FiltrosDeMovimientos filtros={filtros} cuentas={cuentas} verLibroB={permisos.verLibroB} />

      <Panel className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-800">No se pudieron leer los movimientos: {error}</p>
        ) : asientos.length === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">No hay movimientos con estos filtros.</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-2 py-3 text-right font-medium">N°</th>
                <th className="px-3 py-3 font-medium">Detalle</th>
                <th className="px-3 py-3 font-medium">Cuenta</th>
                <th className="px-2 py-3 text-center font-medium">Libro</th>
                <th className="px-3 py-3 text-right font-medium">Importe origen</th>
                <th className="px-3 py-3 text-right font-medium">TC</th>
                <th className="px-4 py-3 text-right font-medium">{filtros.moneda}</th>
              </tr>
            </thead>
            {asientos.map(({ id, filas: lineas }) => {
              const a = lineas[0];
              const anulado = a.estado === "anulado";
              const esAnulacion = Boolean(a.anula_a);
              return (
                <tbody key={id} className={cn("border-b border-black/5 last:border-0", anulado && "text-muted-foreground")}>
                  {lineas.map((l, i) => (
                    <tr key={l.linea_id} className="align-top">
                      {i === 0 ? (
                        <>
                          <td className="px-4 pt-3 pb-1 font-mono whitespace-nowrap tabular-nums" rowSpan={lineas.length}>
                            {formatearFecha(a.fecha)}
                          </td>
                          <td className="px-2 pt-3 pb-1 text-right font-mono tabular-nums" rowSpan={lineas.length}>
                            {a.numero}
                          </td>
                          <td className="max-w-[260px] px-3 pt-3 pb-1" rowSpan={lineas.length}>
                            <p className={cn("font-medium", anulado && "line-through")}>{a.asiento_detalle}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">{TIPOS[a.tipo] ?? a.tipo}</span>
                              {anulado ? <Estado>Anulado</Estado> : null}
                              {esAnulacion ? <Estado>Anulación</Estado> : null}
                            </p>
                            {permisos.registrar && !anulado && !esAnulacion ? (
                              <div className="-ml-2 mt-1">
                                <BotonAnular asientoId={a.asiento_id} numero={a.numero} detalle={a.asiento_detalle} />
                              </div>
                            ) : null}
                          </td>
                        </>
                      ) : null}
                      <td className={cn("px-3 py-1.5", i === 0 && "pt-3", i === lineas.length - 1 && "pb-3")}>
                        <span className="font-mono text-xs tabular-nums">{l.cuenta_codigo}</span>{" "}
                        <span className={cn(Number(l.haber) > 0 && "pl-4")}>{l.cuenta_nombre}</span>
                        {l.linea_detalle ? <span className="text-muted-foreground block text-xs">{l.linea_detalle}</span> : null}
                      </td>
                      <td className={cn("px-2 py-1.5 text-center", i === 0 && "pt-3")}>
                        <ChipLibro libro={l.libro} />
                      </td>
                      <td className={cn("px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums", i === 0 && "pt-3")}>
                        <Importe valor={Number(l.debe) > 0 ? l.importe_origen : `-${l.importe_origen}`} moneda={l.moneda} />
                      </td>
                      <td className={cn("px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums", i === 0 && "pt-3")}>
                        {formatearTC(l.tc)}
                        {l.tc_manual ? (
                          <span
                            className="text-naranja ml-1 text-xs"
                            title={l.tc_referencia ? `Manual. MEP del día: ${formatearTC(l.tc_referencia)}` : "Manual"}
                          >
                            M
                          </span>
                        ) : null}
                      </td>
                      <td className={cn("px-4 py-1.5 text-right font-mono whitespace-nowrap tabular-nums", i === 0 && "pt-3")}>
                        <Importe valor={l[columna]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="border-t border-black/10 text-xs">
                <td colSpan={7} className="text-muted-foreground px-4 py-3 text-right">
                  Total debe / haber en {filtros.moneda}
                </td>
                <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                  {formatearNumero(totalDebe)} / {formatearNumero(totalHaber)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>

      {recortado ? (
        <p className="text-muted-foreground text-xs">
          Se muestran las primeras {formatearNumero(LIMITE_MOVIMIENTOS, 0)} de {formatearNumero(total, 0)} líneas.
          Acotá el período o usá los filtros; la exportación a Excel incluye todas.
        </p>
      ) : null}
    </div>
  );
}

function Importe({ valor, moneda }: { valor: string | number; moneda?: "ARS" | "USD" }) {
  const n = Number(valor);
  return (
    <span className={cn(n < 0 && "text-muted-foreground")}>
      {moneda ? <span className="text-muted-foreground mr-1 text-xs">{moneda === "USD" ? "US$" : "$"}</span> : null}
      {formatearNumero(n)}
    </span>
  );
}

function Estado({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-nav-activo-borde bg-nav-activo rounded-full border px-2 py-0.5 text-[11px] text-[#151515]">
      {children}
    </span>
  );
}
