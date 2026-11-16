import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EncabezadoSeccion } from "@/components/app/encabezado-seccion";
import { Cargando, SinPermiso, SinProyecto, Vacio } from "@/components/app/estados";
import { FormularioAsiento, type Correccion, type LineaManual } from "@/components/contabilidad/formulario-asiento";
import { cargarCuentas, type CuentaConHijos } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";
import { formatearFecha, formatearNumero, formatearTC, hoyArgentina } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Nuevo asiento" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function PaginaNuevoAsiento({ searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/movimientos" className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>
      <Suspense fallback={<Cargando />}>
        <Pagina searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Pagina({ searchParams }: Props) {
  const params = await searchParams;
  const corregir = typeof params.corregir === "string" ? params.corregir : null;
  return (
    <>
      <EncabezadoSeccion
        titulo={corregir ? "Corregir asiento" : "Nuevo asiento"}
        descripcion={
          corregir
            ? "Cambiá lo que haga falta y registrá. El original queda anulado con un contra-asiento en su misma fecha; nada se borra."
            : "Si no indicás el tipo de cambio, se usa el MEP del día (o el último anterior)."
        }
      />
      <Contenido corregir={corregir} />
    </>
  );
}

async function Contenido({ corregir }: { corregir: string | null }) {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto) return <SinProyecto />;
  if (!permisos.registrar) {
    return <SinPermiso texto="Solo un administrador o un contador del proyecto puede registrar asientos." />;
  }
  const plan = await cargarCuentas(proyecto.id);
  const cuentas = plan
    .filter((c) => !c.tieneHijos && !c.es_puente)
    .map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }));

  if (cuentas.length < 2) {
    return (
      <Vacio titulo="Falta el plan de cuentas" texto="Hacen falta al menos dos cuentas sin subcuentas para registrar un asiento.">
        <Link href="/plan-de-cuentas" className="text-sm underline underline-offset-4">
          Ir al plan de cuentas
        </Link>
      </Vacio>
    );
  }

  if (!corregir) return <FormularioAsiento cuentas={cuentas} verLibroB={permisos.verLibroB} hoy={hoyArgentina()} />;

  const r = await cargarCorreccion(proyecto.id, corregir, plan, permisos.verLibroB);
  if ("error" in r) {
    return (
      <Vacio titulo="No se puede corregir este asiento" texto={r.error}>
        <Link href="/movimientos" className="text-sm underline underline-offset-4">
          Volver a Movimientos
        </Link>
      </Vacio>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="border-nav-activo-borde bg-nav-activo rounded-xl border px-3.5 py-2.5 text-sm">
        Corrigiendo el asiento N° {r.correccion.numero} del {formatearFecha(r.correccion.fecha)}.
        {r.aviso ? <span className="mt-1 block text-xs">{r.aviso}</span> : null}
      </p>
      <FormularioAsiento
        key={r.correccion.asientoId}
        cuentas={cuentas}
        verLibroB={permisos.verLibroB}
        hoy={hoyArgentina()}
        correccion={r.correccion}
      />
    </div>
  );
}

type FilaAsiento = {
  id: string;
  numero: number;
  fecha: string;
  detalle: string;
  tipo: string;
  estado: string;
  anula_a: string | null;
};

type FilaLinea = {
  orden: number;
  cuenta_id: string;
  libro: "A" | "B";
  debe: string;
  haber: string;
  moneda: "ARS" | "USD";
  importe_origen: string;
  tc: string;
  tc_manual: boolean;
  importe_ars: string;
  importe_usd: string;
  detalle: string | null;
};

/** Lee el asiento y lo pasa a los campos del formulario (manual, o traspaso entre libros si usaba la cuenta puente). */
async function cargarCorreccion(
  proyectoId: string,
  asientoId: string,
  plan: CuentaConHijos[],
  verLibroB: boolean,
): Promise<{ correccion: Correccion; aviso?: string } | { error: string }> {
  const supabase = await crearClienteServidor();
  const { data: asiento } = await supabase
    .from("asientos")
    .select("id, numero, fecha, detalle, tipo, estado, anula_a")
    .eq("proyecto_id", proyectoId)
    .eq("id", asientoId)
    .maybeSingle<FilaAsiento>();
  if (!asiento) return { error: "No se encontró el asiento." };
  if (asiento.estado === "anulado") return { error: `El asiento N° ${asiento.numero} ya está anulado.` };
  if (asiento.anula_a) return { error: `El asiento N° ${asiento.numero} es una anulación: no se corrige.` };

  const { data: lineas, error } = await supabase
    .from("lineas")
    .select("orden, cuenta_id, libro, debe, haber, moneda, importe_origen, tc, tc_manual, importe_ars, importe_usd, detalle")
    .eq("asiento_id", asientoId)
    .order("orden")
    .returns<FilaLinea[]>();
  if (error || !lineas?.length) return { error: "No se pudieron leer las líneas del asiento." };
  if (!verLibroB && lineas.some((l) => l.libro === "B")) {
    return { error: "El asiento tiene líneas del libro B: solo lo puede corregir quien ve ese libro." };
  }

  const cuenta = new Map(plan.map((c) => [c.id, c]));
  const importado = asiento.tipo === "importado";
  // Importados: el USD de la planilla no siempre sale del TC; se usa el TC implícito (ARS / USD)
  // para que el corregido conserve los mismos importes.
  const tcDe = (l: FilaLinea) => {
    if (importado) {
      const usd = Number(l.importe_usd);
      return formatearTC(usd > 0 ? Math.round((Number(l.importe_ars) / usd) * 10000) / 10000 : Number(l.tc));
    }
    return l.tc_manual ? formatearTC(l.tc) : "";
  };
  const lado = (l: FilaLinea): "debe" | "haber" => (Number(l.debe) > 0 ? "debe" : "haber");

  const base = { asientoId: asiento.id, numero: asiento.numero, fecha: asiento.fecha, detalle: asiento.detalle };
  const propias = lineas.filter((l) => !cuenta.get(l.cuenta_id)?.es_puente);
  const usaPuente = propias.length < lineas.length;

  if (usaPuente && propias.length === 2 && propias[0].libro !== propias[1].libro && verLibroB) {
    const sale = propias.find((l) => lado(l) === "haber");
    const entra = propias.find((l) => lado(l) === "debe");
    if (sale && entra) {
      return {
        correccion: {
          ...base,
          tipo: "traspaso_libros",
          libro: sale.libro,
          caja: sale.cuenta_id,
          libroDestino: entra.libro,
          destino: entra.cuenta_id,
          moneda: sale.moneda,
          importe: formatearNumero(sale.importe_origen),
          tc: tcDe(sale),
        },
      };
    }
  }

  const manuales: LineaManual[] = propias.map((l) => ({
    cuenta: l.cuenta_id,
    libro: l.libro,
    lado: lado(l),
    moneda: l.moneda,
    importe: formatearNumero(l.importe_origen),
    tc: tcDe(l),
    detalle: l.detalle ?? "",
  }));
  return {
    correccion: { ...base, tipo: "manual", manuales },
    aviso: usaPuente
      ? "El original tenía líneas de la cuenta puente, que no se cargan a mano: revisá que cada libro balancee o usá «Traspaso entre libros»."
      : importado
        ? "Viene de la planilla: el TC de cada línea es el implícito (ARS / USD), para que los importes queden iguales."
        : undefined,
  };
}
