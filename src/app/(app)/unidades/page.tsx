import type { Metadata } from "next";

import { SeccionVacia } from "@/components/app/seccion-vacia";

export const metadata: Metadata = { title: "Unidades y cobranzas" };

export default function Pagina() {
  return <SeccionVacia ruta="/unidades" />;
}
