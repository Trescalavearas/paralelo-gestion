import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, ChipLibro, SinPermiso, SinProyecto } from "@/components/app/estados";
import { Panel, Selector } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cargarCuentas, type Cuenta, type FiltroLibro, type Moneda } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearNumero, hoyArgentina } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Informes" };

type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

export default function PaginaInformes({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        titulo="Informes"
        descripcion="Salen de la base respetando los permisos: quien no ve el libro B obtiene solo los totales del A."
      />
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Opciones = { libro: FiltroLibro; moneda: Moneda; desde: string; hasta: string; cuenta: string };

async function Contenido({ searchParams }: Props) {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  if (!permisos.verMovimientos) return <SinPermiso texto="Con el rol comercial todavía no se ven los informes contables." />;

  const p = await searchParams;
  const vista = uno(p.vista) === "mayor" ? "mayor" : "balance";
  const hoy = hoyArgentina();
  const libroPedido = uno(p.libro);
  const o: Opciones = {
    libro: !permisos.verLibroB ? "A" : libroPedido === "A" || libroPedido === "B" ? libroPedido : "AB",
    moneda: uno(p.moneda) === "ARS" ? "ARS" : "USD",
    desde: FECHA.test(uno(p.desde)) ? uno(p.desde) : `${hoy.slice(0, 4)}-01-01`,
    hasta: FECHA.test(uno(p.hasta)) ? uno(p.hasta) : hoy,
    cuenta: /^[0-9a-f-]{36}$/.test(uno(p.cuenta)) ? uno(p.cuenta) : "",
  };
  const cuentas = await cargarCuentas(proyecto.id);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-2" aria-label="Informes">
        {(["balance", "mayor"] as const).map((v) => (
          <Link
            key={v}
            href={`/informes?vista=${v}`}
            aria-current={vista === v ? "page" : undefined}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm",
              vista === v ? "bg-nav-activo border-nav-activo-borde font-medium" : "text-muted-foreground border-black/10 bg-white",
            )}
          >
            {v === "balance" ? "Balance de sumas y saldos" : "Mayor de una cuenta"}
          </Link>
        ))}
      </nav>

      <form method="get" className="grid gap-3 rounded-[22px] border border-black/5 bg-white p-4 sm:grid-cols-2 lg:flex lg:items-end">
        <input type="hidden" name="vista" value={vista} />
        {vista === "mayor" ? (
          <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
            <Label htmlFor="cuenta" className="text-xs">Cuenta</Label>
            <Selector id="cuenta" name="cuenta" defaultValue={o.cuenta} required>
              <option value="">Elegí una cuenta…</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {"  ".repeat(c.nivel - 1)}
                  {c.codigo} {c.nombre}
                </option>
              ))}
            </Selector>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde" className="text-xs">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={o.desde} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta" className="text-xs">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={o.hasta} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="libro" className="text-xs">Libro</Label>
          <Selector id="libro" name="libro" defaultValue={o.libro} disabled={!permisos.verLibroB}>
            {permisos.verLibroB ? <option value="AB">A + B</option> : null}
            <option value="A">A</option>
            {permisos.verLibroB ? <option value="B">B</option> : null}
          </Selector>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="moneda" className="text-xs">Moneda</Label>
          <Selector id="moneda" name="moneda" defaultValue={o.moneda}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </Selector>
        </div>
        <Button type="submit" className="h-9">Ver</Button>
      </form>

      {vista === "balance" ? (
        <Balance proyectoId={proyecto.id} o={o} />
      ) : o.cuenta ? (
        <Mayor proyectoId={proyecto.id} o={o} cuenta={cuentas.find((c) => c.id === o.cuenta)} />
      ) : (
        <Panel className="text-muted-foreground p-10 text-center text-sm">Elegí una cuenta para ver su mayor.</Panel>
      )}
    </div>
  );
}

type FilaBalance = {
  cuenta_id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  es_puente: boolean;
  debe: string;
  haber: string;
  saldo: string;
};

async function Balance({ proyectoId, o }: { proyectoId: string; o: Opciones }) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("balance_sumas_saldos", {
      p_proyecto: proyectoId,
      p_libros: o.libro,
      p_moneda: o.moneda,
      p_desde: o.desde,
      p_hasta: o.hasta,
    });
  if (error) return <Panel className="p-6 text-sm text-red-800">No se pudo calcular el balance: {error.message}</Panel>;
  const filas = ((data ?? []) as FilaBalance[]).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  if (filas.length === 0) {
    return <Panel className="text-muted-foreground p-10 text-center text-sm">No hay movimientos en el período.</Panel>;
  }
  const raiz = filas.filter((f) => f.nivel === 1);
  const total = (campo: "debe" | "haber") => raiz.reduce((s, f) => s + Number(f[campo]), 0);
  const deudor = raiz.reduce((s, f) => s + Math.max(Number(f.saldo), 0), 0);
  const acreedor = raiz.reduce((s, f) => s + Math.max(-Number(f.saldo), 0), 0);

  return (
    <Panel className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-sm font-medium">
          Balance de sumas y saldos · {formatearFecha(o.desde)} al {formatearFecha(o.hasta)} · {o.moneda}
        </h2>
        <ChipLibro libro={o.libro} />
      </div>
      <table className="mt-2 w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
            <th className="px-5 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 text-right font-medium">Debe</th>
            <th className="px-3 py-2 text-right font-medium">Haber</th>
            <th className="px-3 py-2 text-right font-medium">Saldo deudor</th>
            <th className="px-5 py-2 text-right font-medium">Saldo acreedor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {filas.map((f) => {
            const saldo = Number(f.saldo);
            return (
              <tr key={f.cuenta_id} className={cn(f.nivel === 1 && "font-semibold")}>
                <td className="px-5 py-2" style={{ paddingLeft: 20 + (f.nivel - 1) * 20 }}>
                  <span className="font-mono text-xs font-normal">{f.codigo}</span> {f.nombre}
                  {f.es_puente ? <span className="text-muted-foreground ml-2 text-xs font-normal">(puente)</span> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatearNumero(f.debe)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatearNumero(f.haber)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{saldo > 0 ? formatearNumero(saldo) : ""}</td>
                <td className="px-5 py-2 text-right font-mono tabular-nums">{saldo < 0 ? formatearNumero(-saldo) : ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 font-semibold">
            <td className="px-5 py-3">Totales</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearNumero(total("debe"))}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearNumero(total("haber"))}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearNumero(deudor)}</td>
            <td className="px-5 py-3 text-right font-mono tabular-nums">{formatearNumero(acreedor)}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

type FilaMayor = {
  fecha: string | null;
  numero: number | null;
  detalle: string;
  cuenta: string | null;
  libro: "A" | "B" | null;
  debe: string | null;
  haber: string | null;
  saldo: string;
  fila: number;
};

async function Mayor({ proyectoId, o, cuenta }: { proyectoId: string; o: Opciones; cuenta?: Cuenta }) {
  if (!cuenta) return <Panel className="p-6 text-sm">La cuenta no existe en este proyecto.</Panel>;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("mayor_cuenta", {
      p_proyecto: proyectoId,
      p_cuenta: cuenta.id,
      p_libros: o.libro,
      p_moneda: o.moneda,
      p_desde: o.desde,
      p_hasta: o.hasta,
    });
  if (error) return <Panel className="p-6 text-sm text-red-800">No se pudo calcular el mayor: {error.message}</Panel>;
  const filas = ((data ?? []) as FilaMayor[]).sort((a, b) => a.fila - b.fila);
  const final = filas.at(-1);
  const totalDebe = filas.reduce((s, f) => s + Number(f.debe ?? 0), 0);
  const totalHaber = filas.reduce((s, f) => s + Number(f.haber ?? 0), 0);

  return (
    <Panel className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-sm font-medium">
          Mayor de {cuenta.codigo} {cuenta.nombre} · {formatearFecha(o.desde)} al {formatearFecha(o.hasta)} · {o.moneda}
        </h2>
        <ChipLibro libro={o.libro} />
      </div>
      <table className="mt-2 w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
            <th className="px-5 py-2 font-medium">Fecha</th>
            <th className="px-2 py-2 text-right font-medium">N°</th>
            <th className="px-3 py-2 font-medium">Detalle</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-2 py-2 text-center font-medium">Libro</th>
            <th className="px-3 py-2 text-right font-medium">Debe</th>
            <th className="px-3 py-2 text-right font-medium">Haber</th>
            <th className="px-5 py-2 text-right font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {filas.map((f) => (
            <tr key={f.fila} className={cn(f.fila === 0 && "text-muted-foreground")}>
              <td className="px-5 py-2 font-mono whitespace-nowrap tabular-nums">{f.fecha ? formatearFecha(f.fecha) : ""}</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{f.numero ?? ""}</td>
              <td className="px-3 py-2">{f.detalle}</td>
              <td className="px-3 py-2 text-xs">{f.cuenta ?? ""}</td>
              <td className="px-2 py-2 text-center">{f.libro ? <ChipLibro libro={f.libro} /> : null}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{f.debe && Number(f.debe) ? formatearNumero(f.debe) : ""}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{f.haber && Number(f.haber) ? formatearNumero(f.haber) : ""}</td>
              <td className="px-5 py-2 text-right font-mono tabular-nums">{formatearNumero(f.saldo)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/10 font-semibold">
            <td colSpan={5} className="px-5 py-3">Totales del período y saldo final</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearNumero(totalDebe)}</td>
            <td className="px-3 py-3 text-right font-mono tabular-nums">{formatearNumero(totalHaber)}</td>
            <td className="px-5 py-3 text-right font-mono tabular-nums">{formatearNumero(final?.saldo ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}
