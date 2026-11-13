import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { buscarMovimientos, cargarCuentas, leerFiltros } from "@/lib/contabilidad";
import { obtenerContexto } from "@/lib/contexto";

/**
 * Exporta los movimientos filtrados a Excel. Usa la misma consulta que la
 * pantalla (respeta RLS: quien no ve el libro B no lo exporta).
 *
 * Columnas: FECHA / DETALLE / CUENTA / D / H / NETO / CONTRACUENTA / KK/BB /
 * PROYECTO / TC MANUAL / MONEDA. D, H y NETO van en la moneda de la línea.
 * KK = libro B, BB = libro A.
 */
export async function GET(request: NextRequest) {
  const { proyecto, permisos } = await obtenerContexto();
  if (!proyecto || !permisos.verMovimientos) {
    return new Response("No tenés acceso a los movimientos de este proyecto.", { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filtros = leerFiltros(params, permisos.verLibroB);
  const cuentas = await cargarCuentas(proyecto.id);
  const { filas, error } = await buscarMovimientos(proyecto.id, filtros, cuentas, { todo: true });
  if (error) return new Response(`No se pudieron leer los movimientos: ${error}`, { status: 500 });

  // Orden cronológico para el Excel (y dentro de cada asiento, por libro y línea).
  filas.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) || a.numero - b.numero || a.libro.localeCompare(b.libro) || a.orden - b.orden,
  );

  const libro = new ExcelJS.Workbook();
  libro.creator = "Paralelo · Gestión";
  libro.created = new Date();
  const hoja = libro.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });

  const FORMATO_MONTO = "#,##0.00";
  hoja.columns = [
    { header: "FECHA", key: "fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "DETALLE", key: "detalle", width: 48 },
    { header: "CUENTA", key: "cuenta", width: 36 },
    { header: "D", key: "d", width: 16, style: { numFmt: FORMATO_MONTO } },
    { header: "H", key: "h", width: 16, style: { numFmt: FORMATO_MONTO } },
    { header: "NETO", key: "neto", width: 16, style: { numFmt: FORMATO_MONTO } },
    { header: "CONTRACUENTA", key: "contracuenta", width: 36 },
    { header: "KK/BB", key: "kkbb", width: 8 },
    { header: "PROYECTO", key: "proyecto", width: 26 },
    { header: "TC MANUAL", key: "tc", width: 12, style: { numFmt: FORMATO_MONTO } },
    { header: "MONEDA", key: "moneda", width: 9 },
  ];

  for (const f of filas) {
    const [a, m, d] = f.fecha.split("-").map(Number);
    const debe = Number(f.debe);
    const haber = Number(f.haber);
    hoja.addRow({
      fecha: new Date(Date.UTC(a, m - 1, d)),
      detalle: f.linea_detalle ? `${f.asiento_detalle} · ${f.linea_detalle}` : f.asiento_detalle,
      cuenta: `${f.cuenta_codigo} ${f.cuenta_nombre}`,
      d: debe || null,
      h: haber || null,
      neto: Math.round((debe - haber) * 100) / 100,
      contracuenta: f.contracuenta ?? "",
      kkbb: f.libro === "B" ? "KK" : "BB",
      proyecto: proyecto.nombre,
      tc: f.tc_manual ? Number(f.tc) : null,
      moneda: f.moneda,
    });
  }

  // Todo en Arial 10; encabezado azul #1F4E78 con letra blanca.
  hoja.eachRow({ includeEmpty: false }, (fila, n) => {
    fila.eachCell({ includeEmpty: true }, (celda) => {
      celda.font = n === 1 ? { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } } : { name: "Arial", size: 10 };
      if (n === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
        celda.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
  });
  hoja.autoFilter = { from: "A1", to: "K1" };

  const contenido = await libro.xlsx.writeBuffer();
  const nombre = `movimientos_${filtros.desde}_${filtros.hasta}.xlsx`;
  return new Response(contenido, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
