import {
  LayoutDashboard,
  SquareKanban,
  ArrowLeftRight,
  HardHat,
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
