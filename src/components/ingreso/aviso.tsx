import { cn } from "@/lib/utils";

/** Mensaje de error o de confirmación debajo de un formulario. */
export function Aviso({ tipo, children }: { tipo: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={tipo === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm",
        tipo === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-nav-activo-borde bg-nav-activo text-[#151515]",
      )}
    >
      {children}
    </p>
  );
}
