/**
 * Genera un Excel de EJEMPLO con datos INVENTADOS, con la misma forma que la
 * planilla de Crisol (hojas "BASE MOVIMIENTOS" y "MOVIMIENTOS"), para probar la
 * pantalla "Importar" sin usar datos reales.
 *
 *   node scripts/generar-excel-ejemplo.mjs [salida.xlsx]
 *
 * Nada de lo que hay acá corresponde a cuentas, personas ni montos reales.
 */
import ExcelJS from "exceljs";

const salida = process.argv[2] ?? "ejemplo-importacion.xlsx";
const libro = new ExcelJS.Workbook();

// --- Plan de cuentas (inventado) ---------------------------------------------
const plan = libro.addWorksheet("BASE MOVIMIENTOS");
plan.addRow(["NIVEL 1", "NIVEL 2", "NIVEL 3", "NIVEL 4", "COMPUTA"]);
const cuentas = [
  ["1. ACTIVO", "DISPONIBILIDADES", "CAJAS", "CAJA EJEMPLO PESOS", "SI"],
  ["1. ACTIVO", "DISPONIBILIDADES", "CAJAS", "CAJA EJEMPLO USD (BB)", "SI"],
  ["1. ACTIVO", "DISPONIBILIDADES", "CAJAS", "CAJA EJEMPLO USD (KK)", "SI"],
  ["1. ACTIVO", "DISPONIBILIDADES", "BANCOS", "BANCO EJEMPLO PESOS", "SI"],
  ["1. ACTIVO", "DISPONIBILIDADES", "BANCOS", "BANCO EJEMPLO USD", "SI"],
  ["1. ACTIVO", "INVERSIONES", "FONDOS", "FONDO EJEMPLO USD", "SI"],
  ["2. PASIVO", "DEUDAS", "PROVEEDORES", "PROVEEDOR EJEMPLO UNO", "SI"],
  ["3. CAPITAL", "APORTES", "FIDUCIANTES", "APORTES EJEMPLO", "SI"],
  ["A - TERRENO", "COMPRA", "PRECIO", "TERRENO EJEMPLO", "SI"],
  ["B - COSTO CONSTRUCCIÓN", "ESTRUCTURA", "HORMIGÓN", "HORMIGONERA EJEMPLO", "SI"],
  ["B - COSTO CONSTRUCCIÓN", "ALBAÑILERÍA", "MANO DE OBRA", "CONTRATISTA EJEMPLO", "SI"],
  ["D - GASTOS ADMINISTRATIVOS", "HONORARIOS", "PROFESIONALES", "ESTUDIO EJEMPLO", "NO"],
  ["I - INGRESOS", "VENTAS", "CUOTAS", "CUOTAS EJEMPLO", "SI"],
];
for (const c of cuentas) plan.addRow(c);

// --- Movimientos (inventados) --------------------------------------------------
const mov = libro.addWorksheet("MOVIMIENTOS");
mov.addRow([
  "ID", "CONCILIACIÓN", "FECHA", "DETALLE", "CUENTA", "D", "H", "NETO", "CONTRACUENTA",
  "KK/BB", "PROYECTO", "TC MANUAL", "TC AUTOMATICO", "USD", "VAR % USD",
]);
const fecha = (d, m, a) => new Date(Date.UTC(a, m - 1, d));
const filas = [
  // Números como número y fecha como fecha
  [1, "CONCILIADO", fecha(2, 3, 2001), "Aporte inicial de ejemplo", "BANCO EJEMPLO PESOS", 1000000, null, 1000000, "APORTES EJEMPLO", "BB", "EJEMPLO", null, 1000, 1000, null],
  // Números como texto es-AR y fecha como texto
  [2, "", "05/03/2001", "Pago de ejemplo a hormigonera", "HORMIGONERA EJEMPLO", " $250.000,00", null, " $250.000,00", "BANCO EJEMPLO PESOS", "BB", "EJEMPLO", null, "1000,00", "250,00", null],
  // NETO negativo con prefijo USD en el texto y cuenta en dólares
  [3, "CONCILIADO", "10/03/2001", "Compra de dólares de ejemplo", "BANCO EJEMPLO PESOS", null, "102.000,00", "-102.000,00", "BANCO EJEMPLO USD", "BB", "EJEMPLO", "1020", "1000", "-USD100,00", null],
  // Libro B (KK)
  [4, "", "15/03/2001", "Cuota de ejemplo", "CAJA EJEMPLO USD (KK)", 50000, null, 50000, "CUOTAS EJEMPLO", "KK", "EJEMPLO", null, 1000, 50, null],
  // Traspaso entre libros (una fila en cada libro, contra la cuenta puente)
  [5, "", "20/03/2001", "Traspaso de ejemplo a KK", "TRASPASOS ENTRE LIBROS", 20000, null, 20000, "BANCO EJEMPLO PESOS", "BB", "EJEMPLO", null, 1000, 20, null],
  [6, "", "20/03/2001", "Traspaso de ejemplo desde BB", "CAJA EJEMPLO USD (KK)", 20000, null, 20000, "TRASPASOS ENTRE LIBROS", "KK", "EJEMPLO", null, 1000, 20, null],
  // Importe con decimales sin separador de miles
  [7, "", "25/03/2001", "Honorarios de ejemplo", "ESTUDIO EJEMPLO", "1494,02", null, "1494,02", "CAJA EJEMPLO PESOS", "BB", "EJEMPLO", null, 1000, "1,49", null],
  // Filas que se saltean
  [8, "", "26/03/2001", "Fila sin cuenta", "", null, null, 100, "CAJA EJEMPLO PESOS", "BB", "EJEMPLO", null, 1000, 0.1, null],
  [9, "", "27/03/2001", "Fila con neto cero", "CAJA EJEMPLO PESOS", 0, 0, 0, "BANCO EJEMPLO PESOS", "BB", "EJEMPLO", null, 1000, 0, null],
  [10, "", "", "", "", null, null, null, null, "Asignar KK/BB", "", null, null, null, null],
];
for (const f of filas) mov.addRow(f);
mov.getColumn(3).numFmt = "dd/mm/yyyy";

await libro.xlsx.writeFile(salida);
console.log(`Ejemplo inventado guardado en ${salida}`);
