/** Textos para mostrar los valores de los enums de la base. */

export const FIGURAS = {
  fideicomiso: "Fideicomiso",
  pozo: "Venta en pozo",
  propio: "Desarrollo propio",
} as const;

export const ESTADOS_PROYECTO = {
  en_estudio: "En estudio",
  activo: "Activo",
  finalizado: "Finalizado",
  archivado: "Archivado",
} as const;

export const ROLES = {
  administrador: "Administrador",
  contador: "Contador",
  direccion_obra: "Dirección de obra",
  comercial: "Comercial",
  lectura: "Lectura",
} as const;

export type Figura = keyof typeof FIGURAS;
export type EstadoProyecto = keyof typeof ESTADOS_PROYECTO;
export type Rol = keyof typeof ROLES;
