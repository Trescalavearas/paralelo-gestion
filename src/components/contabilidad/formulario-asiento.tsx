"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Plus, Trash2 } from "lucide-react";

import { ChipLibro } from "@/components/app/estados";
import { Panel, Selector } from "@/components/contabilidad/campos";
import { Aviso } from "@/components/ingreso/aviso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  previsualizarAsiento,
  registrarAsiento,
  type LineaCalculada,
  type LineaEntrada,
  type TipoAsiento,
} from "@/lib/acciones-contabilidad";
import { formatearNumero, formatearTC, parsearImporte } from "@/lib/formato";
import { cn } from "@/lib/utils";

type OpcionCuenta = { id: string; codigo: string; nombre: string };
type Libro = "A" | "B";
type Moneda = "ARS" | "USD";

const TIPOS: { valor: TipoAsiento; etiqueta: string; ayuda: string }[] = [
  { valor: "pago", etiqueta: "Pago", ayuda: "Sale plata de una caja o banco hacia un gasto, proveedor u otra cuenta." },
  { valor: "cobro", etiqueta: "Cobro", ayuda: "Entra plata a una caja o banco desde un cliente u otra cuenta." },
  {
    valor: "traspaso_cajas",
    etiqueta: "Traspaso entre cajas",
    ayuda: "Movimiento entre dos cajas del mismo libro. Si cambia la moneda, la base agrega la diferencia de cambio.",
  },
  {
    valor: "traspaso_libros",
    etiqueta: "Traspaso entre libros",
    ayuda: "Pasa fondos del libro A al B o al revés. La base agrega las dos líneas de la cuenta puente.",
  },
  { valor: "manual", etiqueta: "Manual", ayuda: "Cualquier asiento de N líneas. Cada libro tiene que balancear." },
];

type LineaManual = { cuenta: string; libro: Libro; lado: "debe" | "haber"; moneda: Moneda; importe: string; tc: string; detalle: string };

const lineaVacia = (libro: Libro, lado: "debe" | "haber"): LineaManual => ({
  cuenta: "",
  libro,
  lado,
  moneda: "ARS",
  importe: "",
  tc: "",
  detalle: "",
});

export function FormularioAsiento({
  cuentas,
  verLibroB,
  hoy,
}: {
  cuentas: OpcionCuenta[];
  verLibroB: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const [tipo, setTipo] = useState<TipoAsiento>("pago");
  const [fecha, setFecha] = useState(hoy);
  const [detalle, setDetalle] = useState("");

  // Pago / cobro
  const [libro, setLibro] = useState<Libro>("A");
  const [cuenta, setCuenta] = useState("");
  const [caja, setCaja] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [importe, setImporte] = useState("");
  const [tc, setTc] = useState("");

  // Traspaso entre cajas
  const [destino, setDestino] = useState("");
  const [monedaDestino, setMonedaDestino] = useState<Moneda>("ARS");
  const [importeDestino, setImporteDestino] = useState("");

  // Traspaso entre libros
  const [libroDestino, setLibroDestino] = useState<Libro>("B");

  // Manual
  const [manuales, setManuales] = useState<LineaManual[]>([lineaVacia("A", "debe"), lineaVacia("A", "haber")]);

  const [vista, setVista] = useState<{ clave: string; lineas: LineaCalculada[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const libros: Libro[] = verLibroB ? ["A", "B"] : ["A"];

  /** Arma las líneas que se mandan a la base, o devuelve un error de carga. */
  const armado = useMemo((): { lineas: LineaEntrada[] } | { error: string } => {
    const imp = (t: string, nombre = "el importe") => {
      const v = parsearImporte(t);
      if (!v || Number(v) <= 0) throw new Error(`Revisá ${nombre}: tiene que ser un número mayor que cero.`);
      return v;
    };
    const tcOpcional = (t: string) => {
      if (!t.trim()) return undefined;
      const v = parsearImporte(t);
      if (!v || Number(v) <= 0) throw new Error("Revisá el tipo de cambio.");
      return v;
    };
    const falta = (v: string, nombre: string) => {
      if (!v) throw new Error(`Elegí ${nombre}.`);
      return v;
    };

    try {
      if (tipo === "pago" || tipo === "cobro") {
        const monto = imp(importe);
        const t = tcOpcional(tc);
        const lineaCuenta: LineaEntrada = {
          cuenta_id: falta(cuenta, tipo === "pago" ? "la cuenta del gasto o proveedor" : "la cuenta del cliente o ingreso"),
          libro,
          lado: tipo === "pago" ? "debe" : "haber",
          importe: monto,
          moneda,
          tc: t,
        };
        const lineaCaja: LineaEntrada = {
          cuenta_id: falta(caja, "la caja o banco"),
          libro,
          lado: tipo === "pago" ? "haber" : "debe",
          importe: monto,
          moneda,
          tc: t,
        };
        return { lineas: tipo === "pago" ? [lineaCuenta, lineaCaja] : [lineaCaja, lineaCuenta] };
      }

      if (tipo === "traspaso_cajas") {
        const t = tcOpcional(tc);
        const montoOrigen = imp(importe, "el importe que sale");
        const montoDestino = moneda === monedaDestino ? montoOrigen : imp(importeDestino, "el importe que entra");
        return {
          lineas: [
            { cuenta_id: falta(destino, "la caja de destino"), libro, lado: "debe", importe: montoDestino, moneda: monedaDestino, tc: t },
            { cuenta_id: falta(caja, "la caja de origen"), libro, lado: "haber", importe: montoOrigen, moneda, tc: t },
          ],
        };
      }

      if (tipo === "traspaso_libros") {
        if (libro === libroDestino) throw new Error("El libro de origen y el de destino tienen que ser distintos.");
        const monto = imp(importe);
        const t = tcOpcional(tc);
        return {
          lineas: [
            { cuenta_id: falta(caja, "la cuenta de origen"), libro, lado: "haber", importe: monto, moneda, tc: t },
            { cuenta_id: falta(destino, "la cuenta de destino"), libro: libroDestino, lado: "debe", importe: monto, moneda, tc: t },
          ],
        };
      }

      return {
        lineas: manuales.map((l, i) => ({
          cuenta_id: falta(l.cuenta, `la cuenta de la línea ${i + 1}`),
          libro: l.libro,
          lado: l.lado,
          importe: imp(l.importe, `el importe de la línea ${i + 1}`),
          moneda: l.moneda,
          tc: tcOpcional(l.tc),
          detalle: l.detalle.trim() || undefined,
        })),
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [tipo, libro, libroDestino, cuenta, caja, destino, moneda, monedaDestino, importe, importeDestino, tc, manuales]);

  const clave = JSON.stringify({ tipo, fecha, armado });
  const vistaVigente = vista && vista.clave === clave ? vista : null;

  function verPrevia() {
    setError(null);
    if ("error" in armado) return setError(armado.error);
    startTransition(async () => {
      const r = await previsualizarAsiento(fecha, tipo, armado.lineas);
      if (r.error) {
        setVista(null);
        setError(r.error);
      } else setVista({ clave, lineas: r.lineas! });
    });
  }

  function registrar() {
    setError(null);
    if ("error" in armado) return setError(armado.error);
    if (!detalle.trim()) return setError("Escribí el detalle del asiento.");
    startTransition(async () => {
      const r = await registrarAsiento(fecha, detalle, tipo, armado.lineas);
      if (r.error) return setError(r.error);
      const desde = `${fecha.slice(0, 7)}-01`;
      router.push(`/movimientos?registrado=${r.numero}&desde=${desde}&hasta=${fecha > hoy ? fecha : hoy}`);
    });
  }

  const opciones = (
    <>
      <option value="">Elegí una cuenta…</option>
      {cuentas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.codigo} {c.nombre}
        </option>
      ))}
    </>
  );

  const selectorMoneda = (valor: Moneda, cambiar: (m: Moneda) => void, id: string) => (
    <Selector id={id} value={valor} onChange={(e) => cambiar(e.target.value as Moneda)}>
      <option value="ARS">ARS</option>
      <option value="USD">USD</option>
    </Selector>
  );

  const selectorLibro = (valor: Libro, cambiar: (l: Libro) => void, id: string) => (
    <Selector id={id} value={valor} onChange={(e) => cambiar(e.target.value as Libro)} disabled={libros.length === 1}>
      {libros.map((l) => (
        <option key={l} value={l}>
          Libro {l}
        </option>
      ))}
    </Selector>
  );

  const campoTC = (
    <Campo etiqueta="TC (opcional)" id="tc">
      <Input id="tc" value={tc} onChange={(e) => setTc(e.target.value)} inputMode="decimal" placeholder="MEP del día" className="font-mono" />
    </Campo>
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Tipo de asiento</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de asiento">
            {TIPOS.filter((t) => t.valor !== "traspaso_libros" || verLibroB).map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm transition-colors",
                  tipo === t.valor
                    ? "bg-nav-activo border-nav-activo-borde font-medium"
                    : "text-muted-foreground hover:bg-muted border-black/10",
                )}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">{TIPOS.find((t) => t.valor === tipo)?.ayuda}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Campo etiqueta="Fecha" id="fecha">
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Detalle" id="detalle">
            <Input id="detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Por ejemplo: Pago certificado N° 3" maxLength={300} />
          </Campo>
        </div>

        {tipo === "pago" || tipo === "cobro" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_100px_150px_130px]">
            <Campo etiqueta="Libro" id="libro">{selectorLibro(libro, setLibro, "libro")}</Campo>
            <Campo etiqueta={tipo === "pago" ? "Cuenta (debe)" : "Caja o banco (debe)"} id="c1">
              {tipo === "pago" ? (
                <Selector id="c1" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>{opciones}</Selector>
              ) : (
                <Selector id="c1" value={caja} onChange={(e) => setCaja(e.target.value)}>{opciones}</Selector>
              )}
            </Campo>
            <Campo etiqueta={tipo === "pago" ? "Caja o banco (haber)" : "Cuenta (haber)"} id="c2">
              {tipo === "pago" ? (
                <Selector id="c2" value={caja} onChange={(e) => setCaja(e.target.value)}>{opciones}</Selector>
              ) : (
                <Selector id="c2" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>{opciones}</Selector>
              )}
            </Campo>
            <Campo etiqueta="Moneda" id="moneda">{selectorMoneda(moneda, setMoneda, "moneda")}</Campo>
            <Campo etiqueta="Importe" id="importe">
              <Input id="importe" value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" className="font-mono" />
            </Campo>
            {campoTC}
          </div>
        ) : null}

        {tipo === "traspaso_cajas" ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Campo etiqueta="Libro" id="libro">{selectorLibro(libro, setLibro, "libro")}</Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_150px]">
              <Campo etiqueta="Sale de (haber)" id="origen">
                <Selector id="origen" value={caja} onChange={(e) => setCaja(e.target.value)}>{opciones}</Selector>
              </Campo>
              <Campo etiqueta="Moneda" id="moneda">{selectorMoneda(moneda, setMoneda, "moneda")}</Campo>
              <Campo etiqueta="Importe que sale" id="importe">
                <Input id="importe" value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" className="font-mono" />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_100px_150px]">
              <Campo etiqueta="Entra a (debe)" id="destino">
                <Selector id="destino" value={destino} onChange={(e) => setDestino(e.target.value)}>{opciones}</Selector>
              </Campo>
              <Campo etiqueta="Moneda" id="moneda-destino">{selectorMoneda(monedaDestino, setMonedaDestino, "moneda-destino")}</Campo>
              <Campo etiqueta="Importe que entra" id="importe-destino">
                <Input
                  id="importe-destino"
                  value={moneda === monedaDestino ? importe : importeDestino}
                  onChange={(e) => setImporteDestino(e.target.value)}
                  disabled={moneda === monedaDestino}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="font-mono"
                />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
              {campoTC}
              <p className="text-muted-foreground self-end pb-2 text-xs">
                Con monedas distintas, la diferencia entre lo que sale y lo que entra (valuado al TC) va a la cuenta de diferencia de cambio.
              </p>
            </div>
          </div>
        ) : null}

        {tipo === "traspaso_libros" ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Campo etiqueta="Libro origen" id="libro">{selectorLibro(libro, setLibro, "libro")}</Campo>
              <Campo etiqueta="Sale de (haber)" id="origen">
                <Selector id="origen" value={caja} onChange={(e) => setCaja(e.target.value)}>{opciones}</Selector>
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <Campo etiqueta="Libro destino" id="libro-destino">{selectorLibro(libroDestino, setLibroDestino, "libro-destino")}</Campo>
              <Campo etiqueta="Entra a (debe)" id="destino">
                <Selector id="destino" value={destino} onChange={(e) => setDestino(e.target.value)}>{opciones}</Selector>
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-[100px_150px_150px]">
              <Campo etiqueta="Moneda" id="moneda">{selectorMoneda(moneda, setMoneda, "moneda")}</Campo>
              <Campo etiqueta="Importe" id="importe">
                <Input id="importe" value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" className="font-mono" />
              </Campo>
              {campoTC}
            </div>
          </div>
        ) : null}

        {tipo === "manual" ? (
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground hidden grid-cols-[1fr_96px_96px_86px_130px_110px_1fr_36px] gap-2 text-xs lg:grid">
              <span>Cuenta</span><span>Libro</span><span>Lado</span><span>Moneda</span><span>Importe</span><span>TC (opc.)</span><span>Detalle (opc.)</span><span />
            </div>
            {manuales.map((l, i) => {
              const cambiar = (cambio: Partial<LineaManual>) =>
                setManuales((ls) => ls.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
              return (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl border border-black/5 p-2 lg:grid-cols-[1fr_96px_96px_86px_130px_110px_1fr_36px] lg:border-0 lg:p-0">
                  <Selector aria-label={`Cuenta de la línea ${i + 1}`} className="col-span-2 lg:col-span-1" value={l.cuenta} onChange={(e) => cambiar({ cuenta: e.target.value })}>{opciones}</Selector>
                  <Selector aria-label={`Libro de la línea ${i + 1}`} value={l.libro} onChange={(e) => cambiar({ libro: e.target.value as Libro })} disabled={libros.length === 1}>
                    {libros.map((x) => <option key={x} value={x}>Libro {x}</option>)}
                  </Selector>
                  <Selector aria-label={`Lado de la línea ${i + 1}`} value={l.lado} onChange={(e) => cambiar({ lado: e.target.value as "debe" | "haber" })}>
                    <option value="debe">Debe</option>
                    <option value="haber">Haber</option>
                  </Selector>
                  <Selector aria-label={`Moneda de la línea ${i + 1}`} value={l.moneda} onChange={(e) => cambiar({ moneda: e.target.value as Moneda })}>
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </Selector>
                  <Input aria-label={`Importe de la línea ${i + 1}`} value={l.importe} onChange={(e) => cambiar({ importe: e.target.value })} inputMode="decimal" placeholder="0,00" className="font-mono" />
                  <Input aria-label={`TC de la línea ${i + 1}`} value={l.tc} onChange={(e) => cambiar({ tc: e.target.value })} inputMode="decimal" placeholder="MEP" className="font-mono" />
                  <Input aria-label={`Detalle de la línea ${i + 1}`} value={l.detalle} onChange={(e) => cambiar({ detalle: e.target.value })} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={manuales.length <= 2}
                    onClick={() => setManuales((ls) => ls.filter((_, j) => j !== i))}
                    aria-label={`Quitar la línea ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-fit bg-white"
              onClick={() => setManuales((ls) => [...ls, lineaVacia(ls.at(-1)?.libro ?? "A", "haber")])}
            >
              <Plus />
              Agregar línea
            </Button>
          </div>
        ) : null}

        {error ? <Aviso tipo="error">{error}</Aviso> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="bg-white" onClick={verPrevia} disabled={pendiente}>
            <Eye />
            {pendiente && !vistaVigente ? "Calculando…" : "Vista previa"}
          </Button>
          <Button type="button" onClick={registrar} disabled={pendiente || !vistaVigente}>
            {pendiente && vistaVigente ? "Registrando…" : "Registrar asiento"}
          </Button>
          {!vistaVigente ? (
            <span className="text-muted-foreground self-center text-xs">Revisá la vista previa antes de registrar.</span>
          ) : null}
        </div>
      </Panel>

      {vistaVigente ? <VistaPrevia lineas={vistaVigente.lineas} /> : null}
    </div>
  );
}

function Campo({ etiqueta, id, children }: { etiqueta: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      {children}
    </div>
  );
}

function VistaPrevia({ lineas }: { lineas: LineaCalculada[] }) {
  const libros = [...new Set(lineas.map((l) => l.libro))];
  return (
    <Panel className="overflow-x-auto">
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-sm font-medium">Vista previa</h2>
        <span className="text-muted-foreground text-xs">Así se va a registrar. Cada libro balancea en ARS y en USD.</span>
      </div>
      <table className="mt-2 w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
            <th className="px-5 py-2 font-medium">Libro</th>
            <th className="px-3 py-2 font-medium">Cuenta</th>
            <th className="px-3 py-2 text-right font-medium">Debe</th>
            <th className="px-3 py-2 text-right font-medium">Haber</th>
            <th className="px-3 py-2 text-right font-medium">TC</th>
            <th className="px-3 py-2 text-right font-medium">ARS</th>
            <th className="px-5 py-2 text-right font-medium">USD</th>
          </tr>
        </thead>
        {libros.map((lb) => {
          const ls = lineas.filter((l) => l.libro === lb);
          const suma = (campo: "importe_ars" | "importe_usd", lado: "debe" | "haber") =>
            ls.filter((l) => Number(l[lado]) > 0).reduce((s, l) => s + Number(l[campo]), 0);
          return (
            <tbody key={lb} className="border-b border-black/5">
              {ls.map((l) => (
                <tr key={`${l.libro}-${l.orden}`} className={cn(l.generada && "bg-nav-activo/50")}>
                  <td className="px-5 py-2"><ChipLibro libro={l.libro} /></td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{l.cuenta_codigo}</span> {l.cuenta_nombre}
                    {l.generada ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        (agregada: {l.generada === "puente" ? "cuenta puente" : "diferencia de cambio"})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                    {Number(l.debe) > 0 ? `${l.moneda} ${formatearNumero(l.debe)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                    {Number(l.haber) > 0 ? `${l.moneda} ${formatearNumero(l.haber)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatearTC(l.tc)}
                    {l.tc_manual ? <span className="text-naranja ml-1 text-xs" title={l.tc_referencia ? `MEP del día: ${formatearTC(l.tc_referencia)}` : "Manual"}>M</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{(Number(l.haber) > 0 ? "−" : "") + formatearNumero(l.importe_ars)}</td>
                  <td className="px-5 py-2 text-right font-mono tabular-nums">{(Number(l.haber) > 0 ? "−" : "") + formatearNumero(l.importe_usd)}</td>
                </tr>
              ))}
              <tr className="text-muted-foreground text-xs">
                <td colSpan={5} className="px-5 py-2 text-right">Libro {lb}: debe / haber</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {formatearNumero(suma("importe_ars", "debe"))} / {formatearNumero(suma("importe_ars", "haber"))}
                </td>
                <td className="px-5 py-2 text-right font-mono tabular-nums">
                  {formatearNumero(suma("importe_usd", "debe"))} / {formatearNumero(suma("importe_usd", "haber"))}
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </Panel>
  );
}
