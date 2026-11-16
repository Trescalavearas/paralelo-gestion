/**
 * Lectura de la planilla de Crisol (Excel descargado de Google Sheets).
 * Funciones puras: se usan en el navegador y en las pruebas. No hay acceso a la
 * base acá: el resultado se valida contra el plan de cuentas que llega aparte.
 */

// -----------------------------------------------------------------------------
// Celdas, números y fechas
// -----------------------------------------------------------------------------

/** Valor "plano" de una celda de exceljs (fórmulas, texto enriquecido, enlaces). */
export function valorCelda(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return valorCelda(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if ("error" in o) return null;
  }
  return String(v);
}

export function texto(v: unknown): string {
  const c = valorCelda(v);
  if (c === null) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Mayúsculas, sin espacios de más (para comparar nombres de cuentas). */
export function normalizarNombre(t: string): string {
  return t.replace(/ /g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Para encabezados: además sin tildes. */
export function normalizarEncabezado(t: string): string {
  return normalizarNombre(t).normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Número de la planilla: número o texto es-AR (" $3.080.000,00", "-USD10.000,00",
 * "1494,02", "(1.234,50)"). Devuelve el valor como texto decimal con punto
 * ("-10000.00") sin pasar por float, o null si está vacío; lanza si no se entiende.
 */
export function leerNumero(v: unknown, decimales = 2): string | null {
  const c = valorCelda(v);
  if (c === null || c === "") return null;
  if (typeof c === "number") {
    if (!Number.isFinite(c)) throw new Error("número inválido");
    return c.toFixed(decimales);
  }
  if (typeof c === "boolean" || c instanceof Date) throw new Error("no es un número");
  let t = String(c).replace(/ /g, "").replace(/\s+/g, "");
  if (!t || t === "-") return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negativo = !negativo;
    t = t.slice(1);
  }
  t = t.replace(/^(US\$|USD|U\$S|ARS|\$)/i, "");
  if (t.startsWith("-")) {
    negativo = !negativo;
    t = t.slice(1);
  }
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  if (!/^\d+(\.\d+)?$/.test(normal)) throw new Error(`“${String(c).trim()}” no es un número`);
  const [entero, fraccion = ""] = normal.split(".");
  // Redondeo a "decimales" sin float (mitad hacia arriba).
  let frac = fraccion.padEnd(decimales + 1, "0");
  const redondeo = Number(frac[decimales]) >= 5;
  frac = frac.slice(0, decimales);
  const resultado = BigInt(entero + frac) + BigInt(redondeo ? 1 : 0);
  if (resultado === BigInt(0)) negativo = false;
  const s = resultado.toString().padStart(decimales + 1, "0");
  const final = decimales > 0 ? `${s.slice(0, -decimales)}.${s.slice(-decimales)}` : s;
  return (negativo ? "-" : "") + final;
}

/** Centavos enteros (para sumar sin errores de redondeo). */
export function aCentavos(decimal: string): bigint {
  const [e, f = ""] = decimal.replace("-", "").split(".");
  const v = BigInt(e + f.padEnd(2, "0").slice(0, 2));
  return decimal.startsWith("-") ? -v : v;
}

export function deCentavos(c: bigint): string {
  const neg = c < BigInt(0);
  const s = (neg ? -c : c).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Fecha de la planilla (fecha de Excel, número de serie o texto dd/mm/aaaa) → aaaa-mm-dd. */
export function leerFecha(v: unknown): string | null {
  const c = valorCelda(v);
  if (c === null || c === "") return null;
  let a: number, m: number, d: number;
  if (c instanceof Date) {
    // exceljs entrega las fechas como medianoche UTC.
    a = c.getUTCFullYear();
    m = c.getUTCMonth() + 1;
    d = c.getUTCDate();
  } else if (typeof c === "number") {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000);
    a = f.getUTCFullYear();
    m = f.getUTCMonth() + 1;
    d = f.getUTCDate();
  } else {
    const t = String(c).trim();
    const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      a = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    } else if (iso) {
      a = Number(iso[1]);
      m = Number(iso[2]);
      d = Number(iso[3]);
    } else return null;
  }
  const prueba = new Date(Date.UTC(a, m - 1, d));
  if (prueba.getUTCFullYear() !== a || prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) return null;
  if (a < 1990 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------
// Hojas
// -----------------------------------------------------------------------------

/** Lo mínimo que se usa de una hoja de exceljs. */
export type HojaLeida = { nombre: string; filas: unknown[][] };

function buscarEncabezado(hoja: HojaLeida, requeridos: string[]) {
  for (let i = 0; i < Math.min(hoja.filas.length, 15); i++) {
    const enc = hoja.filas[i].map((v) => normalizarEncabezado(texto(v)));
    if (requeridos.every((r) => enc.includes(r))) {
      const columnas = new Map<string, number>();
      enc.forEach((h, j) => {
        if (h && !columnas.has(h)) columnas.set(h, j);
      });
      return { fila: i, columnas };
    }
  }
  return null;
}

export function buscarHoja(hojas: HojaLeida[], nombre: string): HojaLeida | undefined {
  const n = normalizarEncabezado(nombre);
  return hojas.find((h) => normalizarEncabezado(h.nombre) === n);
}

// -----------------------------------------------------------------------------
// Plan de cuentas: hoja "BASE MOVIMIENTOS"
// -----------------------------------------------------------------------------

export type FilaPlan = { n1: string; n2: string; n3: string; n4: string; computa: boolean };

export function leerPlan(hoja: HojaLeida): { filas: FilaPlan[]; errores: string[] } {
  const enc = buscarEncabezado(hoja, ["NIVEL 1", "NIVEL 2", "NIVEL 3", "NIVEL 4"]);
  if (!enc) {
    return { filas: [], errores: [`La hoja “${hoja.nombre}” no tiene las columnas NIVEL 1, NIVEL 2, NIVEL 3 y NIVEL 4.`] };
  }
  const col = (n: string) => enc.columnas.get(n) ?? -1;
  const filas: FilaPlan[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (let i = enc.fila + 1; i < hoja.filas.length; i++) {
    const f = hoja.filas[i];
    const niveles = ["NIVEL 1", "NIVEL 2", "NIVEL 3", "NIVEL 4"].map((n) => texto(f[col(n)]));
    if (niveles.every((n) => !n)) continue;
    // Sin huecos: si falta un nivel intermedio, no se puede armar el camino.
    const ultimo = niveles.reduce((u, n, j) => (n ? j : u), -1);
    if (niveles.slice(0, ultimo + 1).some((n) => !n)) {
      errores.push(`Plan, fila ${i + 1}: falta un nivel intermedio (${niveles.map((n) => n || "—").join(" > ")}).`);
      continue;
    }
    const clave = niveles.map(normalizarNombre).join(" > ");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const computa = normalizarEncabezado(texto(f[col("COMPUTA")]));
    filas.push({ n1: niveles[0], n2: niveles[1], n3: niveles[2], n4: niveles[3], computa: computa !== "NO" });
  }
  return { filas, errores };
}

// -----------------------------------------------------------------------------
// Movimientos: hoja "MOVIMIENTOS"
// -----------------------------------------------------------------------------

export type FilaMovimiento = {
  fila: number; // número de fila en Excel (para los mensajes)
  id: string;
  origen: string;
  fecha: string; // aaaa-mm-dd
  detalle: string;
  cuenta: string;
  contracuenta: string;
  libro: "A" | "B";
  neto: string;
  usd: string;
  tc: string;
  tcManual: boolean;
  tcCalculado: boolean; // sin TC en la planilla: |NETO| / |USD|
  /** USD = 0 (a dos decimales) con las dos cuentas en pesos: entra con importe_usd = 0. */
  ajusteCentavos: boolean;
  proyecto: string;
};

export type Salteadas = { sin_cuenta: number; neto_cero: number; relleno: number };

export type LecturaMovimientos = {
  filas: FilaMovimiento[];
  salteadas: Salteadas;
  errores: string[];
};

const REQUERIDAS = ["ID", "FECHA", "CUENTA", "NETO", "CONTRACUENTA", "KK/BB", "USD"];

export function leerMovimientos(hoja: HojaLeida): LecturaMovimientos {
  const salteadas: Salteadas = { sin_cuenta: 0, neto_cero: 0, relleno: 0 };
  const errores: string[] = [];
  const filas: FilaMovimiento[] = [];
  const enc = buscarEncabezado(hoja, ["FECHA", "CUENTA", "NETO"]);
  if (!enc) {
    return { filas, salteadas, errores: [`La hoja “${hoja.nombre}” no tiene las columnas FECHA, CUENTA y NETO.`] };
  }
  const faltan = REQUERIDAS.filter((r) => !enc.columnas.has(r));
  if (faltan.length) {
    return { filas, salteadas, errores: [`A la hoja “${hoja.nombre}” le faltan columnas: ${faltan.join(", ")}.`] };
  }
  const col = (n: string) => enc.columnas.get(n) ?? -1;
  const ids = new Map<string, number>();

  for (let i = enc.fila + 1; i < hoja.filas.length; i++) {
    const f = hoja.filas[i];
    const nFila = i + 1;
    const celdas = f.map(texto);
    if (celdas.every((c) => !c)) continue;

    // Filas de relleno: "Asignar KK/BB".
    if (celdas.some((c) => normalizarNombre(c).includes("ASIGNAR KK/BB"))) {
      salteadas.relleno++;
      continue;
    }
    const cuenta = texto(f[col("CUENTA")]);
    if (!cuenta) {
      salteadas.sin_cuenta++;
      continue;
    }
    let neto: string | null;
    let usd: string | null;
    let tcManual: string | null;
    let tcAuto: string | null;
    try {
      neto = leerNumero(f[col("NETO")]);
      usd = leerNumero(f[col("USD")]);
      tcManual = col("TC MANUAL") >= 0 ? leerNumero(f[col("TC MANUAL")], 4) : null;
      tcAuto = col("TC AUTOMATICO") >= 0 ? leerNumero(f[col("TC AUTOMATICO")], 4) : null;
    } catch (e) {
      errores.push(`Fila ${nFila}: ${(e as Error).message}.`);
      continue;
    }
    if (!neto || aCentavos(neto) === BigInt(0)) {
      salteadas.neto_cero++;
      continue;
    }

    const id = texto(f[col("ID")]);
    const fecha = leerFecha(f[col("FECHA")]);
    const kkbb = normalizarNombre(texto(f[col("KK/BB")]));
    const contracuenta = texto(f[col("CONTRACUENTA")]);
    const problemas: string[] = [];
    if (!id) problemas.push("falta el ID");
    else if (ids.has(id)) problemas.push(`el ID ${id} se repite (también en la fila ${ids.get(id)})`);
    if (!fecha) problemas.push(`fecha inválida (“${texto(f[col("FECHA")])}”)`);
    if (kkbb !== "KK" && kkbb !== "BB") problemas.push(kkbb ? `libro “${kkbb}” desconocido (va KK o BB)` : "libro vacío (KK/BB) con importe");
    if (!contracuenta) problemas.push("falta la CONTRACUENTA");
    // USD = 0 a dos decimales: ajuste de centavos en pesos. Se acepta si las dos
    // cuentas son en pesos (sus líneas van con importe_usd = 0); una línea en USD
    // no puede tener importe 0.
    const usdCero = usd !== null && aCentavos(usd) === BigInt(0);
    const enDolares = [cuenta, contracuenta].filter((c) => c && esCuentaUSD(c));
    if (usd === null) problemas.push("falta el importe en USD");
    else if (usdCero && enDolares.length) {
      problemas.push(`USD = 0 y ${enDolares.map((c) => `“${c}”`).join(" y ")} es en dólares (una línea en USD no puede tener importe 0)`);
    }
    if (id && !ids.has(id)) ids.set(id, nFila);
    if (problemas.length) {
      errores.push(`Fila ${nFila}${id ? ` (ID ${id})` : ""}: ${problemas.join("; ")}.`);
      continue;
    }

    const manual = tcManual && Number(tcManual) > 0 ? tcManual : null;
    const auto = tcAuto && Number(tcAuto) > 0 ? tcAuto : null;
    let tc: string | null = manual ?? auto;
    let tcCalculado = false;
    if (!tc && usdCero) {
      tc = ""; // sin TC y sin USD: la base usa el MEP del día
    } else if (!tc) {
      const n = Math.abs(Number(neto));
      const u = Math.abs(Number(usd));
      tc = (n / u).toFixed(4);
      tcCalculado = true;
    }

    filas.push({
      fila: nFila,
      id,
      origen: col("CONCILIACION") >= 0 ? texto(f[col("CONCILIACION")]) : "",
      fecha: fecha!,
      detalle: col("DETALLE") >= 0 ? texto(f[col("DETALLE")]) : "",
      cuenta,
      contracuenta,
      libro: kkbb === "KK" ? "B" : "A",
      neto: neto,
      usd: usdCero ? "0.00" : usd!,
      tc,
      tcManual: Boolean(manual),
      tcCalculado,
      ajusteCentavos: usdCero,
      proyecto: col("PROYECTO") >= 0 ? texto(f[col("PROYECTO")]) : "",
    });
  }
  return { filas, salteadas, errores };
}

/** Cuenta en dólares: el nombre contiene "USD". */
export function esCuentaUSD(nombre: string): boolean {
  return normalizarNombre(nombre).includes("USD");
}

// -----------------------------------------------------------------------------
// Plan proyectado y resolución de cuentas por nombre
// -----------------------------------------------------------------------------

export type CuentaExistente = {
  id: string;
  codigo: string;
  nombre: string;
  cuenta_padre: string | null;
  es_puente: boolean;
  es_diferencia_cambio: boolean;
};

export const CAMINO_PUENTE = ["3. CAPITAL", "AJUSTES ENTRE LIBROS", "TRASPASOS", "TRASPASOS ENTRE LIBROS"];
export const CAMINO_DIFERENCIA = ["G - OTROS INGRESOS", "RESULTADOS FINANCIEROS", "DIFERENCIA DE CAMBIO", "DIFERENCIA DE CAMBIO"];

type Nodo = { clave: string; nombre: string; padre: string | null; id: string | null; hijos: number };

/**
 * Plan "después de importar": las cuentas que ya existen más las que agrega la
 * hoja (y las dos especiales). Sirve para la vista previa: cuántas cuentas se
 * crean y qué nombres de cuenta sin subcuentas va a haber.
 */
export function proyectarPlan(existentes: CuentaExistente[], filasPlan: FilaPlan[]) {
  const nodos = new Map<string, Nodo>();
  const porId = new Map(existentes.map((c) => [c.id, c]));
  const caminoDe = (c: CuentaExistente): string => {
    const partes: string[] = [];
    let actual: CuentaExistente | undefined = c;
    while (actual) {
      partes.unshift(normalizarNombre(actual.nombre));
      actual = actual.cuenta_padre ? porId.get(actual.cuenta_padre) : undefined;
    }
    return partes.join(" > ");
  };
  for (const c of existentes) {
    const clave = caminoDe(c);
    const padre = c.cuenta_padre && porId.get(c.cuenta_padre) ? caminoDe(porId.get(c.cuenta_padre)!) : null;
    if (!nodos.has(clave)) nodos.set(clave, { clave, nombre: c.nombre, padre, id: c.id, hijos: 0 });
  }
  let nuevas = 0;
  const agregar = (camino: string[]) => {
    let padre: string | null = null;
    for (const nombre of camino.filter(Boolean)) {
      const clave: string = padre ? `${padre} > ${normalizarNombre(nombre)}` : normalizarNombre(nombre);
      if (!nodos.has(clave)) {
        nodos.set(clave, { clave, nombre, padre, id: null, hijos: 0 });
        nuevas++;
      }
      padre = clave;
    }
  };
  for (const f of filasPlan) agregar([f.n1, f.n2, f.n3, f.n4]);
  agregar(CAMINO_PUENTE);
  agregar(CAMINO_DIFERENCIA);
  for (const n of nodos.values()) if (n.padre && nodos.has(n.padre)) nodos.get(n.padre)!.hijos++;

  // Cuentas especiales que ya existen en otro lugar (la base lo rechaza).
  const avisos: string[] = [];
  const puente = existentes.find((c) => c.es_puente);
  if (puente && caminoDe(puente) !== CAMINO_PUENTE.map(normalizarNombre).join(" > ")) {
    avisos.push(`Ya hay una cuenta puente en otro lugar (${puente.codigo} ${puente.nombre}). Si la creaste a mano y no tiene movimientos, borrala desde “Plan de cuentas” y volvé a subir el archivo.`);
  }
  const dif = existentes.find((c) => c.es_diferencia_cambio);
  if (dif && caminoDe(dif) !== CAMINO_DIFERENCIA.map(normalizarNombre).join(" > ")) {
    avisos.push(`Ya hay una cuenta de diferencia de cambio en otro lugar (${dif.codigo} ${dif.nombre}). Si la creaste a mano y no tiene movimientos, borrala desde “Plan de cuentas” y volvé a subir el archivo.`);
  }

  // Nombre normalizado → cuentas sin subcuentas con ese nombre.
  const hojas = new Map<string, Nodo[]>();
  const conHijos = new Set<string>();
  for (const n of nodos.values()) {
    const k = normalizarNombre(n.nombre);
    if (n.hijos === 0) hojas.set(k, [...(hojas.get(k) ?? []), n]);
    else conHijos.add(k);
  }
  return { nuevas, avisos, hojas, conHijos };
}

export type ResolucionCuenta =
  | { ok: true; clave: string; id: string | null }
  | { ok: false; error: string };

export function resolverCuenta(
  nombre: string,
  plan: { hojas: Map<string, Nodo[]>; conHijos: Set<string> },
): ResolucionCuenta {
  const k = normalizarNombre(nombre);
  const candidatas = plan.hojas.get(k) ?? [];
  if (candidatas.length === 1) return { ok: true, clave: candidatas[0].clave, id: candidatas[0].id };
  if (candidatas.length > 1) {
    return { ok: false, error: `“${nombre}” está repetida en el plan (${candidatas.map((c) => c.clave).join(" / ")})` };
  }
  if (plan.conHijos.has(k)) return { ok: false, error: `“${nombre}” tiene subcuentas (los movimientos van en cuentas sin subcuentas)` };
  return { ok: false, error: `“${nombre}” no existe en el plan de cuentas` };
}

/** Convierte un libro de exceljs en hojas con filas (índice 0 = columna A). */
export function hojasDesdeLibro(libro: {
  worksheets: { name: string; rowCount: number; getRow: (n: number) => { values: unknown } }[];
}): HojaLeida[] {
  return libro.worksheets.map((hoja) => {
    const filas: unknown[][] = [];
    for (let r = 1; r <= hoja.rowCount; r++) {
      const valores = hoja.getRow(r).values;
      // exceljs devuelve las filas con índice 1 (el 0 viene vacío).
      filas.push(Array.isArray(valores) ? valores.slice(1) : []);
    }
    return { nombre: hoja.name, filas };
  });
}
