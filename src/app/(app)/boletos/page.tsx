import type { Metadata } from "next";

import { SeccionVacia } from "@/components/app/seccion-vacia";

export const metadata: Metadata = { title: "Boletos y documentos" };

export default function Pagina() {
  return <SeccionVacia ruta="/boletos" />;
}
