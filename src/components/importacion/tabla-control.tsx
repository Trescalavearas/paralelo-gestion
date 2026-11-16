"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { Panel } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import type { FilaControl } from "@/lib/acciones-importacion";
import { formatearFecha, formatearNumero } from "@/lib/formato";
import { cn } from "@/lib/utils";

const COLUMNAS = [
  ["a_ars", "A · ARS"],
  ["a_usd", "A · USD"],
  ["b_ars", "B · ARS"],
  ["b_usd", "B · USD"],
  ["ab_ars", "A+B · ARS"],
  ["ab_usd", "A+B · USD"],
] as const;

/**
 * Saldos (debe − haber) por NIVEL 1 y NIVEL 2, por libro, para comparar con el
 * INFORME de la planilla.
 */
export function TablaControl({
  filas,
  hasta,
  proyecto,
  verLibroB,
}: {
  filas: FilaControl[];
  hasta: string | null;
  proyecto: string;
  verLibroB: boolean;
}) {
  const [exportando, setExportando] = useState(false);
  const columnas = COLUMNAS.filter(([c]) => verLibroB || !c.startsWith("b_"));

  async function exportar() {
    setExportando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const libro = new ExcelJS.Workbook();
      const hoja = libro.addWorksheet("Control de totales", { views: [{ state: "frozen", ySplit: 1 }] });
      hoja.columns = [
        { header: "NIVEL", key: "nivel", width: 7 },
        { header: "CÓDIGO", key: "codigo", width: 10 },
        { header: "CUENTA", key: "nombre", width: 42 },
        ...columnas.map(([k, t]) => ({ header: t.toUpperCase(), key: k, width: 18, style: { numFmt: "#,##0.00" } })),
      ];
      for (const f of filas) hoja.addRow(f);
      hoja.eachRow((fila, n) =>
        fila.eachCell({ includeEmpty: true }, (celda) => {
          celda.font = { name: "Arial", size: 10, bold: n === 1 || filas[n - 2]?.nivel === 1, color: n === 1 ? { argb: "FFFFFFFF" } : undefined };
          if (n === 1) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
        }),
      );
      const buffer = await libro.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `control_totales_${hasta ?? "hoy"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  return (
    <Panel className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-sm font-medium">
          Control de totales · {proyecto} · saldos al {hasta ? formatearFecha(hasta) : "día de hoy"}
        </h2>
        <Button variant="outline" size="sm" className="bg-white" onClick={exportar} disabled={exportando || !filas.length}>
          <FileSpreadsheet />
          {exportando ? "Exportando…" : "Exportar a Excel"}
        </Button>
      </div>
      <p className="text-muted-foreground px-5 pt-1 text-xs">
        Saldo = debe − haber, por NIVEL 1 y NIVEL 2. Comparalo con el INFORME de la planilla.
        {verLibroB ? "" : " No ves el libro B: solo se muestran los saldos del A."}
      </p>
      {filas.length === 0 ? (
        <p className="text-muted-foreground p-10 text-center text-sm">Todavía no hay movimientos.</p>
      ) : (
        <table className="mt-2 w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-black/5 text-left text-xs">
              <th className="px-5 py-2 font-medium">Cuenta</th>
              {columnas.map(([k, t]) => (
                <th key={k} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {filas.map((f) => (
              <tr key={f.codigo} className={cn(f.nivel === 1 && "bg-black/[0.015] font-semibold")}>
                <td className="px-5 py-2" style={{ paddingLeft: f.nivel === 1 ? 20 : 40 }}>
                  <span className="font-mono text-xs font-normal">{f.codigo}</span> {f.nombre}
                </td>
                {columnas.map(([k]) => (
                  <td key={k} className={cn("px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums", f[k] < 0 && "text-muted-foreground")}>
                    {formatearNumero(f[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
