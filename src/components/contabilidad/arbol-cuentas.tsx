"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, Pencil, Plus, Search } from "lucide-react";

import { FormularioCuenta, type CuentaEditable } from "@/components/contabilidad/formulario-cuenta";
import { Panel } from "@/components/contabilidad/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type NodoCuenta = {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  cuenta_padre: string | null;
  tipo: string;
  computa: boolean;
  rubro_obra: string | null;
  es_puente: boolean;
  es_diferencia_cambio: boolean;
  tieneHijos: boolean;
};

const TIPOS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio_neto: "Patrimonio neto",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

function normalizar(t: string) {
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ArbolCuentas({ cuentas, puedeEditar }: { cuentas: NodoCuenta[]; puedeEditar: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [dialogo, setDialogo] = useState<{ cuenta: CuentaEditable | null; madre: NodoCuenta | null; bloqueada: boolean } | null>(null);
  const cerrar = useCallback(() => setDialogo(null), []);

  const porId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const hijos = useMemo(() => {
    const m = new Map<string | null, NodoCuenta[]>();
    for (const c of cuentas) {
      const k = c.cuenta_padre;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [cuentas]);

  // Con búsqueda: se muestran las coincidencias y sus cuentas madre, todo abierto.
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return null;
    const set = new Set<string>();
    for (const c of cuentas) {
      if (normalizar(c.codigo).includes(q) || normalizar(c.nombre).includes(q)) {
        let actual: NodoCuenta | undefined = c;
        while (actual) {
          set.add(actual.id);
          actual = actual.cuenta_padre ? porId.get(actual.cuenta_padre) : undefined;
        }
      }
    }
    return set;
  }, [busqueda, cuentas, porId]);

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  function filas(padre: string | null): React.ReactNode[] {
    return (hijos.get(padre) ?? [])
      .filter((c) => !visibles || visibles.has(c.id))
      .flatMap((c) => {
        const abierta = visibles ? true : abiertas.has(c.id);
        return [
          <Fila
            key={c.id}
            cuenta={c}
            abierta={abierta}
            alAlternar={() => alternar(c.id)}
            puedeEditar={puedeEditar}
            alEditar={() => setDialogo({ cuenta: c, madre: null, bloqueada: c.tieneHijos })}
            alAgregar={() => setDialogo({ cuenta: null, madre: c, bloqueada: false })}
          />,
          ...(abierta && c.tieneHijos ? filas(c.id) : []),
        ];
      });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre"
            aria-label="Buscar cuenta por código o nombre"
            className="h-10 bg-white pl-9"
          />
        </div>
        <Button variant="outline" className="bg-white" onClick={() => setAbiertas(new Set(cuentas.filter((c) => c.tieneHijos).map((c) => c.id)))}>
          Expandir todo
        </Button>
        <Button variant="outline" className="bg-white" onClick={() => setAbiertas(new Set())}>
          Contraer
        </Button>
        {puedeEditar ? (
          <Button className="ml-auto" onClick={() => setDialogo({ cuenta: null, madre: null, bloqueada: false })}>
            <Plus />
            Nueva cuenta de nivel 1
          </Button>
        ) : null}
      </div>

      <Panel className="overflow-hidden">
        {cuentas.length === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">
            El plan de cuentas está vacío.
            {puedeEditar ? " Empezá por una cuenta de nivel 1." : ""}
          </p>
        ) : visibles && visibles.size === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">Ninguna cuenta coincide con “{busqueda}”.</p>
        ) : (
          <ul role="tree" aria-label="Plan de cuentas" className="divide-y divide-black/5">
            {filas(null)}
          </ul>
        )}
      </Panel>

      {dialogo ? (
        <FormularioCuenta
          abierto
          alCerrar={cerrar}
          cuenta={dialogo.cuenta}
          madre={dialogo.madre}
          bloqueadas={{ especiales: dialogo.bloqueada }}
        />
      ) : null}
    </div>
  );
}

function Fila({
  cuenta: c,
  abierta,
  alAlternar,
  puedeEditar,
  alEditar,
  alAgregar,
}: {
  cuenta: NodoCuenta;
  abierta: boolean;
  alAlternar: () => void;
  puedeEditar: boolean;
  alEditar: () => void;
  alAgregar: () => void;
}) {
  const especial = c.es_puente || c.es_diferencia_cambio;
  return (
    <li
      role="treeitem"
      aria-level={c.nivel}
      aria-expanded={c.tieneHijos ? abierta : undefined}
      aria-selected={false}
      className="group flex items-center gap-2 py-2 pr-3 hover:bg-black/[0.015]"
      style={{ paddingLeft: 12 + (c.nivel - 1) * 24 }}
    >
      <button
        type="button"
        onClick={alAlternar}
        disabled={!c.tieneHijos}
        aria-label={abierta ? `Contraer ${c.nombre}` : `Expandir ${c.nombre}`}
        className={cn("text-muted-foreground flex size-6 items-center justify-center rounded-md", c.tieneHijos ? "hover:bg-muted cursor-pointer" : "invisible")}
      >
        <ChevronRight className={cn("size-4 transition-transform", abierta && "rotate-90")} />
      </button>
      <span className="w-24 shrink-0 font-mono text-sm tabular-nums">{c.codigo}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", c.nivel === 1 && "font-semibold")}>{c.nombre}</span>
      <span className="hidden items-center gap-1.5 sm:flex">
        {c.es_puente ? <Etiqueta naranja>Puente</Etiqueta> : null}
        {c.es_diferencia_cambio ? <Etiqueta naranja>Dif. de cambio</Etiqueta> : null}
        {!c.computa ? <Etiqueta>No computa</Etiqueta> : null}
        {c.rubro_obra ? <Etiqueta>{c.rubro_obra}</Etiqueta> : null}
        <Etiqueta>{TIPOS[c.tipo] ?? c.tipo}</Etiqueta>
      </span>
      {puedeEditar ? (
        <span className="flex items-center gap-0.5">
          {c.nivel < 4 && !especial ? (
            <Button variant="ghost" size="icon" className="size-8" onClick={alAgregar} aria-label={`Agregar subcuenta a ${c.nombre}`} title="Agregar subcuenta">
              <Plus />
            </Button>
          ) : (
            <span className="size-8" />
          )}
          <Button variant="ghost" size="icon" className="size-8" onClick={alEditar} aria-label={`Editar ${c.nombre}`} title="Editar">
            <Pencil />
          </Button>
        </span>
      ) : null}
    </li>
  );
}

function Etiqueta({ children, naranja }: { children: React.ReactNode; naranja?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        naranja ? "border-nav-activo-borde bg-nav-activo text-[#151515]" : "text-muted-foreground border-black/10",
      )}
    >
      {children}
    </span>
  );
}
