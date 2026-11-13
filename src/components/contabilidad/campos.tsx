import { cn } from "@/lib/utils";

/** Select nativo con el estilo de los inputs de shadcn. */
export function Selector({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-xl border bg-white px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Casilla({ label, className, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" className="accent-[#151515] size-4" {...props} />
      {label}
    </label>
  );
}

/** Tarjeta blanca de las pantallas internas. */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-[22px] border border-black/5 bg-white", className)} {...props} />
  );
}
