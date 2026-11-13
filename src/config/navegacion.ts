import {
  LayoutDashboard,
  SquareKanban,
  ArrowLeftRight,
  HardHat,
  ListTree,
  ChartColumnBig,
  Coins,
  Building2,
  FileText,
  FolderPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ItemNavegacion = {
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
  descripcion: string;
};

export const NAVEGACION: ItemNavegacion[] = [
  {
    etiqueta: "Tablero",
    ruta: "/tablero",
    icono: LayoutDashboard,
    descripcion: "Resumen del proyecto: saldos por libro, avance de obra y cobranzas.",
  },
  {
    etiqueta: "Tareas",
    ruta: "/tareas",
    icono: SquareKanban,
    descripcion: "Tablero kanban de tareas del proyecto.",
  },
  {
    etiqueta: "Movimientos",
    ruta: "/movimientos",
    icono: ArrowLeftRight,
    descripcion: "Asientos contables en libros A y B, en ARS y USD.",
  },
  {
    etiqueta: "Plan de cuentas",
    ruta: "/plan-de-cuentas",
    icono: ListTree,
    descripcion: "Cuentas del proyecto en hasta cuatro niveles.",
  },
  {
    etiqueta: "Informes",
    ruta: "/informes",
    icono: ChartColumnBig,
    descripcion: "Mayor de una cuenta y balance de sumas y saldos.",
  },
  {
    etiqueta: "Tipo de cambio",
    ruta: "/tipo-de-cambio",
    icono: Coins,
    descripcion: "Cotizaciones del dólar MEP, blue y oficial.",
  },
  {
    etiqueta: "Presupuesto y avance",
    ruta: "/presupuesto",
    icono: HardHat,
    descripcion: "Presupuesto de obra por rubro y su avance real.",
  },
  {
    etiqueta: "Unidades y cobranzas",
    ruta: "/unidades",
    icono: Building2,
    descripcion: "Unidades del edificio, ventas y estado de cobranzas.",
  },
  {
    etiqueta: "Boletos y documentos",
    ruta: "/boletos",
    icono: FileText,
    descripcion: "Boletos de compraventa y documentación del proyecto.",
  },
  {
    etiqueta: "Nuevo proyecto",
    ruta: "/nuevo-proyecto",
    icono: FolderPlus,
    descripcion: "Análisis de factibilidad de proyectos nuevos.",
  },
  {
    etiqueta: "Usuarios y roles",
    ruta: "/usuarios",
    icono: Users,
    descripcion: "Miembros del proyecto, roles y acceso al libro B.",
  },
];

/** Proyecto activo. En fases siguientes vendrá de la base (tabla proyectos). */
export const PROYECTO_ACTUAL = {
  nombre: "Paralelo · Crisol 168",
  tipo: "Fideicomiso",
};
