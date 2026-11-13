type EncabezadoSeccionProps = {
  titulo: string;
  descripcion?: string;
};

export function EncabezadoSeccion({ titulo, descripcion }: EncabezadoSeccionProps) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      {descripcion ? <p className="text-muted-foreground text-sm">{descripcion}</p> : null}
    </header>
  );
}
