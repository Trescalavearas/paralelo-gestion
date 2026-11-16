"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";

import { ChipLibro } from "@/components/app/estados";
import { Panel } from "@/components/contabilidad/campos";
import { Aviso } from "@/components/ingreso/aviso";
import { Button } from "@/components/ui/button";
import {
  datosParaImportar,
  finalizarLote,
  importarPlan,
  importarTanda,
  iniciarLote,
  type DatosImportacion,
  type FilaParaImportar,
  type LoteFinalizado,
} from "@/lib/acciones-importacion";
import { formatearFecha, formatearNumero } from "@/lib/formato";
import {
  aCentavos,
  buscarHoja,
  deCentavos,
  esCuentaUSD,
  hojasDesdeLibro,
  leerMovimientos,
  leerPlan,
  proyectarPlan,
  resolverCuenta,
  type FilaMovimiento,
  type FilaPlan,
  type Salteadas,
} from "@/lib/importacion/planilla";
import { cn } from "@/lib/utils";

const TANDA = 200;
const PASOS = ["Subir", "Vista previa", "Importar", "Resultado"] as const;

type Previa = {
  archivo: string;
  plan: FilaPlan[] | null;
  cuentasNuevas: number;
  movimientos: FilaMovimiento[] | null;
  nuevas: FilaMovimiento[];
  yaImportadas: number;
  salteadas: Salteadas;
  errores: string[];
  avisos: string[];
  cuentasUSD: string[];
  proyectos: [string, number][];
  tcCalculado: number;
  totales: Record<"A" | "B", { filas: number; ars: bigint; usd: bigint }>;
  desde: string | null;
  hasta: string | null;
};

export function Importador() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState(0);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0, etapa: "" });
  const [resultado, setResultado] = useState<{ lote: LoteFinalizado | null; cuentas: number | null; parcial?: string } | null>(null);

  function reiniciar() {
    setPaso(0);
    setPrevia(null);
    setResultado(null);
    setError(null);
    if (entrada.current) entrada.current.value = "";
  }

  // ---------------------------------------------------------------------------
  // 1 → 2: leer el archivo y armar la vista previa
  // ---------------------------------------------------------------------------
  async function leerArchivo(archivo: File) {
    setError(null);
    setLeyendo(true);
    try {
      if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Subí el archivo .xlsx que descarga Google Sheets (Archivo → Descargar → Microsoft Excel).");
      }
      const ExcelJS = (await import("exceljs")).default;
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(await archivo.arrayBuffer());
      const hojas = hojasDesdeLibro(libro as never);
      const hojaPlan = buscarHoja(hojas, "BASE MOVIMIENTOS");
      const hojaMov = buscarHoja(hojas, "MOVIMIENTOS");
      if (!hojaPlan && !hojaMov) {
        throw new Error(`El archivo no tiene las hojas “BASE MOVIMIENTOS” ni “MOVIMIENTOS” (tiene: ${hojas.map((h) => h.nombre).join(", ")}).`);
      }

      const datos = await datosParaImportar();
      if (!datos.ok) throw new Error(datos.error);
      setPrevia(armarPrevia(archivo.name, hojaPlan ? leerPlan(hojaPlan) : null, hojaMov ? leerMovimientos(hojaMov) : null, datos.datos));
      setPaso(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  }

  // ---------------------------------------------------------------------------
  // 2 → 3 → 4: importar
  // ---------------------------------------------------------------------------
  async function importar() {
    if (!previa) return;
    setPaso(2);
    setError(null);
    let cuentasCreadas: number | null = null;
    let loteId: string | null = null;
    let hechas = 0;
    try {
      if (previa.plan) {
        setProgreso({ hechas: 0, total: 1, etapa: "Plan de cuentas" });
        const r = await importarPlan(previa.plan);
        if (!r.ok) throw new Error(r.error);
        cuentasCreadas = r.datos.creadas;
      }

      let lote: LoteFinalizado | null = null;
      if (previa.movimientos && previa.nuevas.length) {
        // Con el plan ya cargado, se buscan los IDs de las cuentas.
        const datos = await datosParaImportar();
        if (!datos.ok) throw new Error(datos.error);
        const plan = proyectarPlan(datos.datos.cuentas, []);
        const idDe = (nombre: string) => {
          const r = resolverCuenta(nombre, plan);
          if (!r.ok || !r.id) throw new Error(r.ok ? `No se encontró la cuenta “${nombre}”.` : r.error);
          return r.id;
        };
        const filas: FilaParaImportar[] = previa.nuevas.map((f) => ({
          id: f.id,
          origen: f.origen,
          fecha: f.fecha,
          detalle: f.detalle,
          libro: f.libro,
          cuenta_id: idDe(f.cuenta),
          contracuenta_id: idDe(f.contracuenta),
          neto: f.neto,
          usd: f.usd,
          tc: f.tc,
          tc_manual: f.tcManual,
          moneda_cuenta: esCuentaUSD(f.cuenta) ? "USD" : "ARS",
          moneda_contracuenta: esCuentaUSD(f.contracuenta) ? "USD" : "ARS",
        }));

        const inicio = await iniciarLote(previa.archivo, { ...previa.salteadas, ya_importadas: previa.yaImportadas });
        if (!inicio.ok) throw new Error(inicio.error);
        loteId = inicio.datos;

        setProgreso({ hechas: 0, total: filas.length, etapa: "Movimientos" });
        for (let i = 0; i < filas.length; i += TANDA) {
          const r = await importarTanda(loteId, filas.slice(i, i + TANDA));
          if (!r.ok) throw new Error(r.error);
          hechas += r.datos.importadas;
          setProgreso({ hechas: Math.min(i + TANDA, filas.length), total: filas.length, etapa: "Movimientos" });
        }
        const fin = await finalizarLote(loteId);
        if (!fin.ok) throw new Error(fin.error);
        lote = fin.datos;
      }

      setResultado({ lote, cuentas: cuentasCreadas });
      setPaso(3);
      router.refresh();
    } catch (e) {
      let parcial: string | undefined;
      if (loteId) {
        await finalizarLote(loteId);
        parcial = `Se importaron ${hechas} fila(s) antes del error. Podés corregir la planilla y volver a subirla (las filas ya importadas se saltean) o deshacer el lote desde el historial.`;
      }
      setError((e as Error).message);
      setResultado({ lote: null, cuentas: cuentasCreadas, parcial });
      setPaso(3);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap gap-2" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li
            key={p}
            aria-current={i === paso ? "step" : undefined}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm",
              i === paso ? "bg-nav-activo border-nav-activo-borde font-medium" : i < paso ? "border-black/10 bg-white" : "text-muted-foreground border-black/10",
            )}
          >
            {i + 1}. {p}
          </li>
        ))}
      </ol>

      {paso === 0 ? (
        <Panel className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="bg-nav-activo text-naranja flex size-12 items-center justify-center rounded-2xl">
            <FileUp className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">Subí el Excel de la planilla</p>
            <p className="text-muted-foreground max-w-md text-sm">
              En Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx). Se lee en tu navegador: el archivo no se
              guarda en ningún lado. Se usan las hojas “BASE MOVIMIENTOS” (plan de cuentas) y “MOVIMIENTOS”.
            </p>
          </div>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            id="archivo"
            onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
          />
          <Button asChild disabled={leyendo}>
            <label htmlFor="archivo" className="cursor-pointer">
              {leyendo ? "Leyendo…" : "Elegir archivo"}
            </label>
          </Button>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
        </Panel>
      ) : null}

      {paso === 1 && previa ? <VistaPrevia previa={previa} alConfirmar={importar} alCancelar={reiniciar} /> : null}

      {paso === 2 ? (
        <Panel className="flex flex-col gap-3 p-8">
          <p className="font-medium">Importando… {progreso.etapa}</p>
          <div className="h-2 overflow-hidden rounded-full bg-black/5" role="progressbar" aria-valuenow={progreso.hechas} aria-valuemax={progreso.total}>
            <div className="bg-naranja h-full transition-all" style={{ width: `${progreso.total ? (100 * progreso.hechas) / progreso.total : 5}%` }} />
          </div>
          <p className="text-muted-foreground text-sm">
            {formatearNumero(progreso.hechas, 0)} de {formatearNumero(progreso.total, 0)}. No cierres esta pestaña.
          </p>
        </Panel>
      ) : null}

      {paso === 3 && resultado ? (
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-3 p-6">
            {error ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="text-naranja size-5" />
                  La importación no terminó
                </p>
                <Aviso tipo="error">{error}</Aviso>
                {resultado.parcial ? <p className="text-sm">{resultado.parcial}</p> : null}
              </>
            ) : (
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-naranja size-5" />
                Importación terminada
              </p>
            )}
            <ul className="text-sm">
              {resultado.cuentas !== null ? <li>Plan de cuentas: {resultado.cuentas} cuenta(s) nueva(s).</li> : null}
              {resultado.lote ? (
                <>
                  <li>
                    Movimientos: {formatearNumero(resultado.lote.filas_importadas, 0)} asiento(s) importado(s)
                    {resultado.lote.filas_existentes ? `, ${resultado.lote.filas_existentes} ya estaban` : ""}.
                  </li>
                  {resultado.lote.fecha_desde ? (
                    <li>
                      Del {formatearFecha(resultado.lote.fecha_desde)} al {formatearFecha(resultado.lote.fecha_hasta!)}.
                    </li>
                  ) : null}
                </>
              ) : null}
            </ul>
            <Button variant="outline" className="w-fit bg-white" onClick={reiniciar}>
              Importar otro archivo
            </Button>
          </Panel>
          <p className="text-muted-foreground text-sm">
            Compará el <a href="#control-de-totales" className="underline underline-offset-4">control de totales</a> (más
            abajo) con el INFORME de la planilla.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Vista previa
// -----------------------------------------------------------------------------

function armarPrevia(
  archivo: string,
  plan: ReturnType<typeof leerPlan> | null,
  mov: ReturnType<typeof leerMovimientos> | null,
  datos: DatosImportacion,
): Previa {
  const errores = [...(plan?.errores ?? []), ...(mov?.errores ?? [])];
  const proyectado = proyectarPlan(datos.cuentas, plan?.filas ?? []);
  const ya = new Set(datos.idsExistentes);
  const cerrados = new Set(datos.mesesCerrados);
  const nuevas: FilaMovimiento[] = [];
  const usd = new Set<string>();
  const proyectos = new Map<string, number>();
  const totales = { A: { filas: 0, ars: BigInt(0), usd: BigInt(0) }, B: { filas: 0, ars: BigInt(0), usd: BigInt(0) } };
  let yaImportadas = 0;
  let tcCalculado = 0;
  let desde: string | null = null;
  let hasta: string | null = null;

  for (const f of mov?.filas ?? []) {
    if (ya.has(f.id)) {
      yaImportadas++;
      continue;
    }
    const problemas: string[] = [];
    for (const nombre of [f.cuenta, f.contracuenta]) {
      const r = resolverCuenta(nombre, proyectado);
      if (!r.ok) problemas.push(r.error);
      if (esCuentaUSD(nombre)) usd.add(nombre.toUpperCase().replace(/\s+/g, " "));
    }
    if (cerrados.has(f.fecha.slice(0, 7))) problemas.push(`el mes de ${formatearFecha(f.fecha)} está cerrado`);
    if (f.libro === "B" && !datos.verLibroB) problemas.push("es del libro B (KK) y no tenés acceso a ese libro");
    if (problemas.length) {
      errores.push(`Fila ${f.fila} (ID ${f.id}): ${problemas.join("; ")}.`);
      continue;
    }
    nuevas.push(f);
    const t = totales[f.libro];
    t.filas++;
    t.ars += aCentavos(f.neto.replace("-", ""));
    t.usd += aCentavos(f.usd.replace("-", ""));
    if (f.tcCalculado) tcCalculado++;
    if (f.proyecto) proyectos.set(f.proyecto, (proyectos.get(f.proyecto) ?? 0) + 1);
    if (!desde || f.fecha < desde) desde = f.fecha;
    if (!hasta || f.fecha > hasta) hasta = f.fecha;
  }

  return {
    archivo,
    plan: plan?.filas ?? null,
    cuentasNuevas: plan ? proyectado.nuevas : 0,
    movimientos: mov?.filas ?? null,
    nuevas,
    yaImportadas,
    salteadas: mov?.salteadas ?? { sin_cuenta: 0, neto_cero: 0, relleno: 0 },
    errores,
    avisos: proyectado.avisos,
    cuentasUSD: [...usd].sort(),
    proyectos: [...proyectos.entries()].sort((a, b) => b[1] - a[1]),
    tcCalculado,
    totales,
    desde,
    hasta,
  };
}

function VistaPrevia({ previa: p, alConfirmar, alCancelar }: { previa: Previa; alConfirmar: () => void; alCancelar: () => void }) {
  const bloqueado = p.errores.length > 0 || p.avisos.length > 0;
  const nada = !p.plan?.length && !p.nuevas.length;
  const total = (campo: "ars" | "usd") => p.totales.A[campo] + p.totales.B[campo];
  const n = (c: bigint) => formatearNumero(deCentavos(c));

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{p.archivo}</h2>
          {p.desde ? (
            <span className="text-muted-foreground text-sm">
              Movimientos nuevos del {formatearFecha(p.desde)} al {formatearFecha(p.hasta!)}
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Dato titulo="Plan de cuentas" valor={p.plan ? `${p.plan.length} filas` : "Sin hoja"} detalle={p.plan ? `${p.cuentasNuevas} cuenta(s) nueva(s)` : "No se toca el plan"} />
          <Dato titulo="Movimientos nuevos" valor={formatearNumero(p.nuevas.length, 0)} detalle={p.yaImportadas ? `${formatearNumero(p.yaImportadas, 0)} ya importados (se saltean)` : "Ninguno importado antes"} />
          <Dato
            titulo="Filas salteadas"
            valor={formatearNumero(p.salteadas.sin_cuenta + p.salteadas.neto_cero + p.salteadas.relleno, 0)}
            detalle={`${p.salteadas.sin_cuenta} sin cuenta · ${p.salteadas.neto_cero} con NETO 0 · ${p.salteadas.relleno} de relleno`}
          />
          <Dato titulo="Errores" valor={formatearNumero(p.errores.length + p.avisos.length, 0)} detalle={bloqueado ? "Hay que corregirlos para importar" : "Ninguno"} alerta={bloqueado} />
        </div>

        {p.nuevas.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
                <th className="py-2 font-medium">Libro</th>
                <th className="py-2 text-right font-medium">Asientos</th>
                <th className="py-2 text-right font-medium">Total ARS (|NETO|)</th>
                <th className="py-2 text-right font-medium">Total USD (|USD|)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 font-mono tabular-nums">
              {(["A", "B"] as const).map((l) => (
                <tr key={l}>
                  <td className="py-2 font-sans"><ChipLibro libro={l} /> <span className="text-muted-foreground text-xs">{l === "A" ? "BB" : "KK"}</span></td>
                  <td className="py-2 text-right">{formatearNumero(p.totales[l].filas, 0)}</td>
                  <td className="py-2 text-right">{n(p.totales[l].ars)}</td>
                  <td className="py-2 text-right">{n(p.totales[l].usd)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 font-sans">A + B</td>
                <td className="py-2 text-right">{formatearNumero(p.nuevas.length, 0)}</td>
                <td className="py-2 text-right">{n(total("ars"))}</td>
                <td className="py-2 text-right">{n(total("usd"))}</td>
              </tr>
            </tbody>
          </table>
        ) : null}

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl border border-black/5 p-3.5">
            <p className="mb-1 font-medium">Cuentas tomadas en dólares</p>
            <p className="text-muted-foreground mb-2 text-xs">Su línea va en USD con importe de origen = |USD|. Las demás, en ARS con |NETO|.</p>
            {p.cuentasUSD.length ? (
              <ul className="list-inside list-disc">
                {p.cuentasUSD.map((c) => <li key={c}>{c}</li>)}
              </ul>
            ) : (
              <p className="text-muted-foreground">Ninguna.</p>
            )}
          </div>
          <div className="rounded-2xl border border-black/5 p-3.5">
            <p className="mb-1 font-medium">Otros datos</p>
            <ul className="text-muted-foreground space-y-1">
              <li>
                PROYECTO en la planilla:{" "}
                {p.proyectos.length ? p.proyectos.map(([nombre, c]) => `${nombre} (${c})`).join(", ") : "vacío"}
              </li>
              <li>
                Filas sin TC (se usa |NETO| / |USD|): {p.tcCalculado}
              </li>
            </ul>
          </div>
        </div>

        {[...p.avisos, ...p.errores].length ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
            <p className="mb-2 font-medium">
              No se importa nada hasta corregir {p.avisos.length + p.errores.length === 1 ? "este problema" : `estos ${p.avisos.length + p.errores.length} problemas`}:
            </p>
            <ul className="max-h-72 list-inside list-disc space-y-1 overflow-y-auto">
              {[...p.avisos, ...p.errores].slice(0, 200).map((e, i) => <li key={i}>{e}</li>)}
              {p.avisos.length + p.errores.length > 200 ? <li>… y {p.avisos.length + p.errores.length - 200} más.</li> : null}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={alConfirmar} disabled={bloqueado || nada}>
            Confirmar e importar
          </Button>
          <Button variant="outline" className="bg-white" onClick={alCancelar}>
            Cancelar
          </Button>
          {nada && !bloqueado ? <span className="text-muted-foreground self-center text-sm">No hay nada nuevo para importar.</span> : null}
        </div>
      </Panel>
    </div>
  );
}

function Dato({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3.5", alerta ? "border-red-200 bg-red-50" : "border-black/5")}>
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className={cn("font-mono text-xl tabular-nums", alerta && "text-red-800")}>{valor}</p>
      <p className="text-muted-foreground text-xs">{detalle}</p>
    </div>
  );
}
