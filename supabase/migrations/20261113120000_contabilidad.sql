-- =============================================================================
-- Fase 2 · Contabilidad en libros A y B, en ARS y USD
--
-- Plan de cuentas (cuenta puente y de diferencia de cambio), cotizaciones,
-- asientos y líneas (solo por funciones), cierres de mes, informes que
-- respetan RLS y permisos por fila.
--
-- Requiere la migración 20261113000000_esquema_inicial.sql. No carga datos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.tipo_cotizacion as enum ('mep', 'blue', 'oficial');

create type public.libro_contable as enum ('A', 'B');

create type public.tipo_asiento as enum (
  'pago',
  'cobro',
  'traspaso_cajas',
  'traspaso_libros',
  'ajuste',
  'manual'
);

create type public.estado_asiento as enum ('registrado', 'anulado');


-- -----------------------------------------------------------------------------
-- Plan de cuentas: cuenta puente y cuenta de diferencia de cambio
-- -----------------------------------------------------------------------------

alter table public.cuentas
  add column es_puente boolean not null default false,
  add column es_diferencia_cambio boolean not null default false,
  add constraint cuentas_puente_o_diferencia check (not (es_puente and es_diferencia_cambio));

comment on column public.cuentas.es_puente is
  'Cuenta "Traspasos entre libros". Se usa en los dos libros; en A+B suma cero.';
comment on column public.cuentas.es_diferencia_cambio is
  'Cuenta donde va la diferencia de cambio de los asientos que mezclan monedas o TC.';

-- Como máximo una de cada tipo por proyecto.
create unique index cuentas_una_puente_por_proyecto
  on public.cuentas (proyecto_id) where es_puente;
create unique index cuentas_una_diferencia_por_proyecto
  on public.cuentas (proyecto_id) where es_diferencia_cambio;


-- -----------------------------------------------------------------------------
-- Cotizaciones (comunes a todos los proyectos)
-- -----------------------------------------------------------------------------

create table public.cotizaciones (
  id             bigint generated always as identity primary key,
  fecha          date not null,
  tipo           public.tipo_cotizacion not null,
  compra         numeric(14, 4) not null check (compra > 0),
  venta          numeric(14, 4) not null check (venta > 0),
  fuente         text not null default 'manual',
  cargada_por    uuid references public.perfiles (id) on delete set null,  -- null = carga automática
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (fecha, tipo)
);
comment on table public.cotizaciones is
  'Una fila por fecha y tipo. Para convertir se usa el valor de venta del MEP.';
create index cotizaciones_tipo_fecha_idx on public.cotizaciones (tipo, fecha desc);


-- -----------------------------------------------------------------------------
-- Cierres de mes
-- -----------------------------------------------------------------------------

create table public.cierres (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  mes         date not null check (mes = date_trunc('month', mes)::date),  -- primer día del mes
  cerrado_por uuid references public.perfiles (id) on delete set null,
  cerrado_en  timestamptz not null default now(),
  unique (proyecto_id, mes)
);
comment on table public.cierres is 'Meses cerrados: no se registra ni se anula con fecha de un mes cerrado.';


-- -----------------------------------------------------------------------------
-- Asientos y líneas
-- -----------------------------------------------------------------------------

create table public.asientos (
  id               uuid primary key default gen_random_uuid(),
  proyecto_id      uuid not null references public.proyectos (id) on delete restrict,
  numero           integer not null check (numero > 0),
  fecha            date not null,
  detalle          text not null check (length(btrim(detalle)) > 0),
  tipo             public.tipo_asiento not null,
  estado           public.estado_asiento not null default 'registrado',
  anula_a          uuid unique,  -- en un contra-asiento: el asiento que anula
  motivo_anulacion text,
  creado_por       uuid references public.perfiles (id) on delete set null,
  creado_en        timestamptz not null default now(),
  unique (proyecto_id, numero),
  unique (proyecto_id, id),
  foreign key (proyecto_id, anula_a) references public.asientos (proyecto_id, id) on delete restrict,
  check ((anula_a is null) = (motivo_anulacion is null))
);
create index asientos_proyecto_fecha_idx on public.asientos (proyecto_id, fecha desc, numero desc);

create table public.lineas (
  id             uuid primary key default gen_random_uuid(),
  asiento_id     uuid not null,
  proyecto_id    uuid not null,
  orden          smallint not null check (orden > 0),
  cuenta_id      uuid not null,
  libro          public.libro_contable not null,
  debe           numeric(18, 2) not null default 0 check (debe >= 0),
  haber          numeric(18, 2) not null default 0 check (haber >= 0),
  moneda         public.moneda not null,
  importe_origen numeric(18, 2) not null check (importe_origen > 0),
  tc             numeric(14, 4) not null check (tc > 0),
  tc_manual      boolean not null default false,
  tc_referencia  numeric(14, 4) check (tc_referencia > 0),  -- MEP del día, para ver el desvío
  importe_ars    numeric(18, 2) not null check (importe_ars >= 0),
  importe_usd    numeric(18, 2) not null check (importe_usd >= 0),
  detalle        text,
  unique (asiento_id, orden),
  foreign key (proyecto_id, asiento_id) references public.asientos (proyecto_id, id) on delete restrict,
  foreign key (proyecto_id, cuenta_id) references public.cuentas (proyecto_id, id) on delete restrict,
  -- Debe o haber (uno solo), igual al importe en la moneda de origen.
  check (
    (debe > 0 and haber = 0 and debe = importe_origen)
    or (haber > 0 and debe = 0 and haber = importe_origen)
  )
);
comment on column public.lineas.importe_origen is 'Importe en la moneda de la línea (igual a debe o haber).';
comment on column public.lineas.importe_ars is 'Valor en pesos (sin signo; el lado lo da debe/haber).';
comment on column public.lineas.importe_usd is 'Valor en dólares (sin signo; el lado lo da debe/haber).';
create index lineas_asiento_idx on public.lineas (asiento_id);
create index lineas_proyecto_cuenta_idx on public.lineas (proyecto_id, cuenta_id);
create index lineas_proyecto_libro_idx on public.lineas (proyecto_id, libro);


-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Quién ve movimientos: todos menos "comercial" (por ahora).
create function public.puede_ver_movimientos(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.rol_en(p_proyecto) in ('administrador', 'contador', 'direccion_obra', 'lectura'),
    false
  );
$$;

-- Quién registra y anula asientos.
create function public.puede_registrar(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_en(p_proyecto) in ('administrador', 'contador'), false);
$$;

-- Quién carga cotizaciones: administrador o contador de algún proyecto.
create function public.puede_cargar_cotizaciones()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.miembros m
    where m.usuario_id = (select auth.uid())
      and m.rol in ('administrador', 'contador')
  );
$$;

-- Hoy en Argentina.
create function public.hoy_ar()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

-- MEP (venta) del día o del último día anterior con cotización (hasta 10 días).
create function public.tc_mep(p_fecha date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select c.venta
  from public.cotizaciones c
  where c.tipo = 'mep'
    and c.fecha <= p_fecha
    and c.fecha > p_fecha - 10
  order by c.fecha desc
  limit 1;
$$;

create function public.mes_cerrado(p_proyecto uuid, p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cierres c
    where c.proyecto_id = p_proyecto
      and c.mes = date_trunc('month', p_fecha)::date
  );
$$;

-- 1.234,56 para los mensajes de error.
create function public.numero_ar(p_numero numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(to_char(p_numero, 'FM999,999,999,999,990.00'), ',.', '.,');
$$;

-- dd/mm/aaaa para los mensajes de error.
create function public.fecha_ar(p_fecha date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_fecha, 'DD/MM/YYYY');
$$;


-- -----------------------------------------------------------------------------
-- Reglas que valida la base (aunque se escriba directo desde el SQL Editor)
-- -----------------------------------------------------------------------------

-- Cuentas: no colgar cuentas de una que ya tiene movimientos, ni cambiarle el
-- carácter de puente / diferencia de cambio a una cuenta usada.
create function public.validar_cuenta_contable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cuenta_padre is not null
     and (tg_op = 'INSERT' or new.cuenta_padre is distinct from old.cuenta_padre)
     and exists (select 1 from public.lineas l where l.cuenta_id = new.cuenta_padre) then
    raise exception 'No se puede agregar una subcuenta a una cuenta que ya tiene movimientos.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and (new.es_puente is distinct from old.es_puente
          or new.es_diferencia_cambio is distinct from old.es_diferencia_cambio)
     and exists (select 1 from public.lineas l where l.cuenta_id = new.id) then
    raise exception 'La cuenta % ya tiene movimientos: no se puede cambiar si es puente o de diferencia de cambio.',
      new.codigo using errcode = 'check_violation';
  end if;

  if (new.es_puente or new.es_diferencia_cambio)
     and exists (select 1 from public.cuentas c where c.cuenta_padre = new.id) then
    raise exception 'La cuenta puente y la de diferencia de cambio tienen que ser cuentas sin subcuentas.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger cuentas_validar_contable
  before insert or update on public.cuentas
  for each row execute function public.validar_cuenta_contable();

-- Una cuenta que es padre de otra no puede ser puente ni de diferencia.
create function public.validar_padre_no_especial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cuenta_padre is not null and exists (
    select 1 from public.cuentas c
    where c.id = new.cuenta_padre and (c.es_puente or c.es_diferencia_cambio)
  ) then
    raise exception 'La cuenta puente y la de diferencia de cambio no pueden tener subcuentas.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger cuentas_padre_no_especial
  before insert or update of cuenta_padre on public.cuentas
  for each row execute function public.validar_padre_no_especial();

-- Cotizaciones: quién la cargó lo pone la base (null = automática).
create function public.marcar_cotizacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cargada_por := (select auth.uid());
  if new.cargada_por is not null then
    new.fuente := 'manual';
  end if;
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.creado_en := old.creado_en;
  end if;
  return new;
end;
$$;

create trigger cotizaciones_marcar
  before insert or update on public.cotizaciones
  for each row execute function public.marcar_cotizacion();

-- Cierres: quién cerró lo pone la base.
create function public.marcar_cierre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cerrado_por := (select auth.uid());
  new.cerrado_en := now();
  return new;
end;
$$;

create trigger cierres_marcar
  before insert on public.cierres
  for each row execute function public.marcar_cierre();

-- Líneas: coherencia de cada línea al insertarla.
create function public.validar_linea()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_asiento public.asientos%rowtype;
  v_cuenta  public.cuentas%rowtype;
  v_exacto  numeric;
begin
  select * into v_asiento from public.asientos a where a.id = new.asiento_id;
  select * into v_cuenta from public.cuentas c where c.id = new.cuenta_id;

  if public.mes_cerrado(v_asiento.proyecto_id, v_asiento.fecha) then
    raise exception 'El mes de % está cerrado.', public.fecha_ar(v_asiento.fecha)
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.cuentas c where c.cuenta_padre = new.cuenta_id) then
    raise exception 'La cuenta % tiene subcuentas: los movimientos van en cuentas sin subcuentas.',
      v_cuenta.codigo using errcode = 'check_violation';
  end if;

  if v_cuenta.es_puente and v_asiento.tipo <> 'traspaso_libros' then
    raise exception 'La cuenta puente solo se usa en traspasos entre libros.'
      using errcode = 'check_violation';
  end if;

  -- El importe en la moneda de origen es exacto; el de la otra moneda sale del TC
  -- (con ajuste de redondeo menor a un centavo). La línea de diferencia de cambio
  -- generada por la base puede llevar valores independientes en cada moneda.
  if new.moneda = 'ARS' then
    if new.importe_ars <> new.importe_origen then
      raise exception 'Línea en ARS: el importe en pesos tiene que ser igual al importe de origen.';
    end if;
    v_exacto := new.importe_origen / new.tc;
    if not v_cuenta.es_diferencia_cambio and abs(new.importe_usd - v_exacto) >= 0.01 then
      raise exception 'Línea en ARS: el importe en USD (%) no corresponde al TC %.', new.importe_usd, new.tc;
    end if;
  else
    if new.importe_usd <> new.importe_origen then
      raise exception 'Línea en USD: el importe en dólares tiene que ser igual al importe de origen.';
    end if;
    v_exacto := new.importe_origen * new.tc;
    if not v_cuenta.es_diferencia_cambio and abs(new.importe_ars - v_exacto) >= 0.01 then
      raise exception 'Línea en USD: el importe en ARS (%) no corresponde al TC %.', new.importe_ars, new.tc;
    end if;
  end if;

  return new;
end;
$$;

create trigger lineas_validar
  before insert on public.lineas
  for each row execute function public.validar_linea();

-- Partida doble: al terminar la transacción, cada libro del asiento balancea
-- en ARS y en USD. Es un trigger diferido: corre al confirmar, con todas las
-- líneas ya cargadas.
create function public.verificar_balance_asiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_numero integer;
  r record;
begin
  if (select count(*) from public.lineas l where l.asiento_id = new.asiento_id) < 2 then
    raise exception 'Un asiento necesita al menos dos líneas.' using errcode = 'check_violation';
  end if;

  for r in
    select l.libro,
           sum(case when l.debe > 0 then l.importe_ars else -l.importe_ars end) as dif_ars,
           sum(case when l.debe > 0 then l.importe_usd else -l.importe_usd end) as dif_usd
    from public.lineas l
    where l.asiento_id = new.asiento_id
    group by l.libro
  loop
    if r.dif_ars <> 0 or r.dif_usd <> 0 then
      select a.numero into v_numero from public.asientos a where a.id = new.asiento_id;
      raise exception 'El asiento % no balancea en el libro %: diferencia ARS %, USD %.',
        v_numero, r.libro, public.numero_ar(r.dif_ars), public.numero_ar(r.dif_usd)
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger lineas_partida_doble
  after insert on public.lineas
  deferrable initially deferred
  for each row execute function public.verificar_balance_asiento();

-- Nada se borra ni se modifica: los errores se corrigen con contra-asiento.
create function public.bloquear_cambios_contables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'asientos' and tg_op = 'UPDATE' then
    if old.estado = 'registrado' and new.estado = 'anulado'
       and (to_jsonb(new) - 'estado') = (to_jsonb(old) - 'estado') then
      return new;  -- único cambio permitido: marcarlo como anulado
    end if;
  end if;
  raise exception 'Los asientos y sus líneas no se modifican ni se borran: se anulan con un contra-asiento.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger asientos_inmutables
  before update or delete on public.asientos
  for each row execute function public.bloquear_cambios_contables();

create trigger asientos_sin_truncate
  before truncate on public.asientos
  for each statement execute function public.bloquear_cambios_contables();

create trigger lineas_inmutables
  before update or delete on public.lineas
  for each row execute function public.bloquear_cambios_contables();

create trigger lineas_sin_truncate
  before truncate on public.lineas
  for each statement execute function public.bloquear_cambios_contables();


-- -----------------------------------------------------------------------------
-- Auditoría de las tablas nuevas
-- -----------------------------------------------------------------------------

create trigger auditar_asientos
  after insert or update or delete on public.asientos
  for each row execute function public.auditar();

create trigger auditar_lineas
  after insert or update or delete on public.lineas
  for each row execute function public.auditar();

create trigger auditar_cierres
  after insert or update or delete on public.cierres
  for each row execute function public.auditar();

create trigger auditar_cotizaciones
  after insert or update or delete on public.cotizaciones
  for each row execute function public.auditar();

-- La auditoría no puede mostrar lo que RLS oculta: los registros de líneas del
-- libro B (y de asientos sin líneas visibles) solo los ve quien ve el libro B.
drop policy "auditoria: leer si soy administrador" on public.auditoria;

create policy "auditoria: leer si soy administrador"
  on public.auditoria for select to authenticated
  using (
    proyecto_id is not null
    and public.es_administrador(proyecto_id)
    and case tabla
      when 'lineas' then
        coalesce(despues, antes) ->> 'libro' = 'A' or public.ve_libro_b(proyecto_id)
      when 'asientos' then
        exists (select 1 from public.lineas l where l.asiento_id = registro_id::uuid)
      else true
    end
  );


-- -----------------------------------------------------------------------------
-- Registro de asientos
--
-- Las líneas llegan en jsonb, cada una con:
--   cuenta_id, libro ('A'|'B'), lado ('debe'|'haber'), importe, moneda ('ARS'|'USD'),
--   tc (opcional: si no viene se usa el MEP del día), detalle (opcional).
--
-- Traspaso entre libros: llegan 2 líneas (origen al haber en un libro, destino
-- al debe en el otro) y la base agrega las 2 de la cuenta puente.
-- Mezcla de monedas o de TC: la base agrega la diferencia de cambio.
-- -----------------------------------------------------------------------------

create function public.preparar_asiento(
  p_proyecto uuid,
  p_fecha    date,
  p_tipo     public.tipo_asiento,
  p_lineas   jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mep       numeric := public.tc_mep(p_fecha);
  v_ve_b      boolean := public.ve_libro_b(p_proyecto);
  v_puente    public.cuentas%rowtype;
  v_dif       public.cuentas%rowtype;
  v_n         integer;
  v_elem      jsonb;
  v_i         integer := 0;
  v_cuenta    public.cuentas%rowtype;
  v_lado      text;
  v_importe   numeric;
  v_moneda    public.moneda;
  v_libro     public.libro_contable;
  v_tc        numeric;
  v_manual    boolean;
  r           record;
  v_dif_ars   numeric;
  v_dif_usd   numeric;
  v_resultado jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = 'insufficient_privilege';
  end if;
  if not public.puede_registrar(p_proyecto) then
    raise exception 'Solo un administrador o un contador del proyecto puede registrar asientos.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha.';
  end if;
  if public.mes_cerrado(p_proyecto, p_fecha) then
    raise exception 'El mes de % está cerrado.', public.fecha_ar(p_fecha);
  end if;
  if jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception 'Las líneas tienen que venir en una lista.';
  end if;

  v_n := jsonb_array_length(p_lineas);
  if p_tipo = 'traspaso_libros' and v_n <> 2 then
    raise exception 'Un traspaso entre libros lleva una cuenta de origen y una de destino.';
  elsif v_n < 2 then
    raise exception 'Un asiento necesita al menos dos líneas.';
  end if;

  if to_regclass('pg_temp._asiento_lineas') is null then
  create temporary table _asiento_lineas (
    orden          integer,
    cuenta_id      uuid,
    libro          public.libro_contable,
    signo          integer,  -- 1 debe, -1 haber
    moneda         public.moneda,
    importe_origen numeric(18, 2),
    tc             numeric(14, 4),
    tc_manual      boolean,
    tc_referencia  numeric(14, 4),
    importe_ars    numeric(18, 2),
    importe_usd    numeric(18, 2),
    detalle        text,
    generada       text      -- null | 'puente' | 'diferencia'
  ) on commit drop;
  end if;
  truncate _asiento_lineas;

  -- 1. Validar y normalizar cada línea.
  for v_elem in select * from jsonb_array_elements(p_lineas) loop
    v_i := v_i + 1;

    select * into v_cuenta from public.cuentas c
    where c.id = nullif(v_elem ->> 'cuenta_id', '')::uuid and c.proyecto_id = p_proyecto;
    if not found then
      raise exception 'Línea %: la cuenta no existe en este proyecto.', v_i;
    end if;
    if exists (select 1 from public.cuentas c where c.cuenta_padre = v_cuenta.id) then
      raise exception 'Línea %: la cuenta % tiene subcuentas; elegí una cuenta sin subcuentas.', v_i, v_cuenta.codigo;
    end if;
    if v_cuenta.es_puente then
      raise exception 'Línea %: la cuenta puente la agrega el sistema en los traspasos entre libros.', v_i;
    end if;

    v_libro := nullif(v_elem ->> 'libro', '')::public.libro_contable;
    if v_libro is null then
      raise exception 'Línea %: falta el libro.', v_i;
    end if;
    if v_libro = 'B' and not v_ve_b then
      raise exception 'Línea %: no tenés acceso al libro B.', v_i using errcode = 'insufficient_privilege';
    end if;

    v_lado := v_elem ->> 'lado';
    if v_lado not in ('debe', 'haber') or v_lado is null then
      raise exception 'Línea %: indicá si va al debe o al haber.', v_i;
    end if;

    v_importe := nullif(v_elem ->> 'importe', '')::numeric;
    if v_importe is null or v_importe <= 0 then
      raise exception 'Línea %: el importe tiene que ser mayor que cero.', v_i;
    end if;
    if v_importe <> round(v_importe, 2) then
      raise exception 'Línea %: el importe admite hasta dos decimales.', v_i;
    end if;

    v_moneda := nullif(v_elem ->> 'moneda', '')::public.moneda;
    if v_moneda is null then
      raise exception 'Línea %: falta la moneda.', v_i;
    end if;

    v_tc := nullif(v_elem ->> 'tc', '')::numeric;
    v_manual := v_tc is not null;
    if v_manual then
      if v_tc <= 0 then
        raise exception 'Línea %: el tipo de cambio tiene que ser mayor que cero.', v_i;
      end if;
      v_tc := round(v_tc, 4);
    else
      if v_mep is null then
        raise exception 'No hay cotización MEP para el % ni para los 10 días anteriores. Cargala en "Tipo de cambio" o indicá un TC manual.',
          public.fecha_ar(p_fecha);
      end if;
      v_tc := v_mep;
    end if;

    insert into _asiento_lineas (orden, cuenta_id, libro, signo, moneda, importe_origen, tc, tc_manual,
                                 tc_referencia, detalle)
    values (v_i, v_cuenta.id, v_libro, case v_lado when 'debe' then 1 else -1 end, v_moneda, v_importe,
            v_tc, v_manual, v_mep, nullif(btrim(v_elem ->> 'detalle'), ''));
  end loop;

  -- 2. Reglas por tipo.
  if p_tipo in ('pago', 'cobro', 'traspaso_cajas')
     and (select count(distinct libro) from _asiento_lineas) > 1 then
    raise exception 'Un % va en un solo libro. Para pasar fondos de un libro al otro usá "Traspaso entre libros".',
      replace(p_tipo::text, '_', ' ');
  end if;

  if p_tipo = 'traspaso_libros' then
    select * into v_puente from public.cuentas c where c.proyecto_id = p_proyecto and c.es_puente;
    if not found then
      raise exception 'Falta definir la cuenta puente "Traspasos entre libros" en el Plan de cuentas.';
    end if;
    if (select count(distinct libro) from _asiento_lineas) <> 2
       or (select sum(signo) from _asiento_lineas) <> 0
       or (select count(distinct (moneda, importe_origen, tc)) from _asiento_lineas) <> 1 then
      raise exception 'Traspaso entre libros: origen y destino van en libros distintos, uno al debe y otro al haber, con la misma moneda, importe y TC.';
    end if;
    -- Cada libro se cierra contra la cuenta puente.
    insert into _asiento_lineas (orden, cuenta_id, libro, signo, moneda, importe_origen, tc, tc_manual,
                                 tc_referencia, detalle, generada)
    select 2 + row_number() over (order by l.orden), v_puente.id, l.libro, -l.signo, l.moneda,
           l.importe_origen, l.tc, l.tc_manual, l.tc_referencia, 'Traspaso entre libros', 'puente'
    from _asiento_lineas l;
  end if;

  -- 3. Importes en la otra moneda, con redondeo al centavo por el método del
  --    mayor resto (cada línea queda a menos de un centavo del valor exacto y el
  --    total coincide con el total exacto redondeado).
  update _asiento_lineas
  set importe_ars = case when moneda = 'ARS' then importe_origen end,
      importe_usd = case when moneda = 'USD' then importe_origen end;

  with exactos as (
    select orden, libro, signo * importe_origen * tc * 100 as e
    from _asiento_lineas where moneda = 'USD'
  ), partes as (
    select orden, libro, floor(e) as piso, e - floor(e) as resto, e from exactos
  ), faltan as (
    select libro, round(sum(e)) - sum(piso) as k from partes group by libro
  ), asignado as (
    select p.orden, p.piso + case when row_number() over (partition by p.libro order by p.resto desc, p.orden) <= f.k
                                  then 1 else 0 end as centavos
    from partes p join faltan f using (libro)
  )
  update _asiento_lineas l set importe_ars = abs(a.centavos) / 100
  from asignado a where a.orden = l.orden;

  with exactos as (
    select orden, libro, signo * importe_origen / tc * 100 as e
    from _asiento_lineas where moneda = 'ARS'
  ), partes as (
    select orden, libro, floor(e) as piso, e - floor(e) as resto, e from exactos
  ), faltan as (
    select libro, round(sum(e)) - sum(piso) as k from partes group by libro
  ), asignado as (
    select p.orden, p.piso + case when row_number() over (partition by p.libro order by p.resto desc, p.orden) <= f.k
                                  then 1 else 0 end as centavos
    from partes p join faltan f using (libro)
  )
  update _asiento_lineas l set importe_usd = abs(a.centavos) / 100
  from asignado a where a.orden = l.orden;

  -- 4. Partida doble por libro.
  for r in
    select libro,
           count(distinct moneda) as monedas,
           sum(signo * importe_origen) as dif_origen,
           min(moneda::text) as moneda,
           sum(signo * importe_ars) as dif_ars,
           sum(signo * importe_usd) as dif_usd
    from _asiento_lineas
    group by libro
    order by libro
  loop
    -- En una sola moneda, el debe y el haber de origen tienen que ser iguales.
    if r.monedas = 1 and r.dif_origen <> 0 then
      raise exception 'El asiento no balancea en el libro %: el % supera al % en % %.',
        r.libro,
        case when r.dif_origen > 0 then 'debe' else 'haber' end,
        case when r.dif_origen > 0 then 'haber' else 'debe' end,
        r.moneda, public.numero_ar(abs(r.dif_origen));
    end if;

    -- Lo que falta para balancear en ARS y en USD es diferencia de cambio
    -- (monedas mezcladas o TC distintos entre líneas).
    v_dif_ars := r.dif_ars;
    v_dif_usd := r.dif_usd;
    if v_dif_ars <> 0 or v_dif_usd <> 0 then
      if v_dif.id is null then
        select * into v_dif from public.cuentas c where c.proyecto_id = p_proyecto and c.es_diferencia_cambio;
        if not found then
          raise exception 'El asiento genera diferencia de cambio en el libro %, pero falta definir la cuenta de diferencia de cambio en el Plan de cuentas.',
            r.libro;
        end if;
      end if;

      if sign(v_dif_ars) * sign(v_dif_usd) >= 0 then
        -- Una sola línea alcanza (las dos diferencias van del mismo lado).
        insert into _asiento_lineas (orden, cuenta_id, libro, signo, moneda, importe_origen, tc, tc_manual,
                                     tc_referencia, importe_ars, importe_usd, detalle, generada)
        select (select max(orden) from _asiento_lineas) + 1, v_dif.id, r.libro,
               -sign(coalesce(nullif(v_dif_ars, 0), v_dif_usd))::integer,
               case when v_dif_ars <> 0 then 'ARS' else 'USD' end::public.moneda,
               case when v_dif_ars <> 0 then abs(v_dif_ars) else abs(v_dif_usd) end,
               coalesce(v_mep, (select l.tc from _asiento_lineas l where l.libro = r.libro order by l.orden limit 1)),
               false, v_mep, abs(v_dif_ars), abs(v_dif_usd), 'Diferencia de cambio', 'diferencia';
      else
        -- Van de lados opuestos: una línea por moneda.
        insert into _asiento_lineas (orden, cuenta_id, libro, signo, moneda, importe_origen, tc, tc_manual,
                                     tc_referencia, importe_ars, importe_usd, detalle, generada)
        select (select max(orden) from _asiento_lineas) + x.n, v_dif.id, r.libro, x.signo, x.moneda, x.importe,
               coalesce(v_mep, (select l.tc from _asiento_lineas l where l.libro = r.libro order by l.orden limit 1)),
               false, v_mep, x.ars, x.usd, 'Diferencia de cambio', 'diferencia'
        from (values
          (1, -sign(v_dif_ars)::integer, 'ARS'::public.moneda, abs(v_dif_ars), abs(v_dif_ars), 0::numeric),
          (2, -sign(v_dif_usd)::integer, 'USD'::public.moneda, abs(v_dif_usd), 0::numeric, abs(v_dif_usd))
        ) as x(n, signo, moneda, importe, ars, usd);
      end if;
    end if;
  end loop;

  -- 5. Resultado (también sirve como vista previa).
  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', l.orden,
           'cuenta_id', l.cuenta_id,
           'cuenta_codigo', c.codigo,
           'cuenta_nombre', c.nombre,
           'libro', l.libro,
           'debe', case when l.signo = 1 then l.importe_origen else 0 end,
           'haber', case when l.signo = -1 then l.importe_origen else 0 end,
           'moneda', l.moneda,
           'importe_origen', l.importe_origen,
           'tc', l.tc,
           'tc_manual', l.tc_manual,
           'tc_referencia', l.tc_referencia,
           'importe_ars', l.importe_ars,
           'importe_usd', l.importe_usd,
           'detalle', l.detalle,
           'generada', l.generada
         ) order by l.libro, l.orden), '[]'::jsonb)
  into v_resultado
  from _asiento_lineas l
  join public.cuentas c on c.id = l.cuenta_id;

  return v_resultado;
end;
$$;

-- Vista previa: calcula las líneas sin registrar nada.
create function public.previsualizar_asiento(
  p_proyecto uuid,
  p_fecha    date,
  p_tipo     public.tipo_asiento,
  p_lineas   jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.preparar_asiento(p_proyecto, p_fecha, p_tipo, p_lineas);
$$;

create function public.registrar_asiento(
  p_proyecto uuid,
  p_fecha    date,
  p_detalle  text,
  p_tipo     public.tipo_asiento,
  p_lineas   jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lineas  jsonb;
  v_id      uuid;
  v_numero  integer;
begin
  if nullif(btrim(p_detalle), '') is null then
    raise exception 'Falta el detalle del asiento.';
  end if;

  v_lineas := public.preparar_asiento(p_proyecto, p_fecha, p_tipo, p_lineas);

  -- Número correlativo por proyecto (bloquea el proyecto hasta confirmar).
  perform 1 from public.proyectos p where p.id = p_proyecto for update;
  select coalesce(max(a.numero), 0) + 1 into v_numero from public.asientos a where a.proyecto_id = p_proyecto;

  insert into public.asientos (proyecto_id, numero, fecha, detalle, tipo, creado_por)
  values (p_proyecto, v_numero, p_fecha, btrim(p_detalle), p_tipo, (select auth.uid()))
  returning id into v_id;

  insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, debe, haber, moneda,
                             importe_origen, tc, tc_manual, tc_referencia, importe_ars, importe_usd, detalle)
  select v_id, p_proyecto, row_number() over (order by l.libro, l.orden), l.cuenta_id, l.libro,
         case when l.signo = 1 then l.importe_origen else 0 end,
         case when l.signo = -1 then l.importe_origen else 0 end,
         l.moneda, l.importe_origen, l.tc, l.tc_manual, l.tc_referencia, l.importe_ars, l.importe_usd, l.detalle
  from pg_temp._asiento_lineas l;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;

-- Anulación: contra-asiento con fecha de hoy y el original marcado como anulado.
create function public.anular_asiento(p_asiento uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_original public.asientos%rowtype;
  v_hoy      date := public.hoy_ar();
  v_id       uuid;
  v_numero   integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_original from public.asientos a where a.id = p_asiento;
  if not found or not public.puede_ver_movimientos(v_original.proyecto_id) then
    raise exception 'El asiento no existe.';
  end if;
  if not public.puede_registrar(v_original.proyecto_id) then
    raise exception 'Solo un administrador o un contador del proyecto puede anular asientos.'
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indicá el motivo de la anulación.';
  end if;
  if v_original.estado = 'anulado' then
    raise exception 'El asiento % ya está anulado.', v_original.numero;
  end if;
  if v_original.anula_a is not null then
    raise exception 'El asiento % es una anulación: no se puede anular.', v_original.numero;
  end if;
  if not public.ve_libro_b(v_original.proyecto_id)
     and exists (select 1 from public.lineas l where l.asiento_id = p_asiento and l.libro = 'B') then
    raise exception 'El asiento tiene líneas del libro B: solo lo puede anular quien ve ese libro.'
      using errcode = 'insufficient_privilege';
  end if;
  if public.mes_cerrado(v_original.proyecto_id, v_hoy) then
    raise exception 'El mes actual (%) está cerrado: no se puede anular.', to_char(v_hoy, 'MM/YYYY');
  end if;

  perform 1 from public.proyectos p where p.id = v_original.proyecto_id for update;
  select coalesce(max(a.numero), 0) + 1 into v_numero
  from public.asientos a where a.proyecto_id = v_original.proyecto_id;

  insert into public.asientos (proyecto_id, numero, fecha, detalle, tipo, anula_a, motivo_anulacion, creado_por)
  values (v_original.proyecto_id, v_numero, v_hoy,
          'Anulación del asiento ' || v_original.numero || ': ' || btrim(p_motivo),
          v_original.tipo, v_original.id, btrim(p_motivo), (select auth.uid()))
  returning id into v_id;

  -- Mismas líneas con debe y haber invertidos.
  insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, debe, haber, moneda,
                             importe_origen, tc, tc_manual, tc_referencia, importe_ars, importe_usd, detalle)
  select v_id, l.proyecto_id, l.orden, l.cuenta_id, l.libro, l.haber, l.debe, l.moneda,
         l.importe_origen, l.tc, l.tc_manual, l.tc_referencia, l.importe_ars, l.importe_usd, l.detalle
  from public.lineas l
  where l.asiento_id = v_original.id;

  update public.asientos set estado = 'anulado' where id = v_original.id;

  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;


-- -----------------------------------------------------------------------------
-- Consultas e informes (SECURITY INVOKER: respetan RLS; quien no ve el libro B
-- obtiene totales solo del A)
-- -----------------------------------------------------------------------------

create view public.movimientos
with (security_invoker = true)
as
select
  l.id               as linea_id,
  l.asiento_id,
  l.proyecto_id,
  a.numero,
  a.fecha,
  a.detalle          as asiento_detalle,
  a.tipo,
  a.estado,
  a.anula_a,
  l.orden,
  l.cuenta_id,
  c.codigo           as cuenta_codigo,
  c.nombre           as cuenta_nombre,
  l.libro,
  l.debe,
  l.haber,
  l.moneda,
  l.importe_origen,
  l.tc,
  l.tc_manual,
  l.tc_referencia,
  l.importe_ars,
  l.importe_usd,
  case when l.debe > 0 then l.importe_ars else -l.importe_ars end as neto_ars,
  case when l.debe > 0 then l.importe_usd else -l.importe_usd end as neto_usd,
  l.detalle          as linea_detalle,
  (
    select case when count(*) = 1 then max(c2.codigo || ' ' || c2.nombre) when count(*) > 1 then 'Varias' end
    from public.lineas l2
    join public.cuentas c2 on c2.id = l2.cuenta_id
    where l2.asiento_id = l.asiento_id
      and l2.libro = l.libro
      and (l2.debe > 0) <> (l.debe > 0)
  )                  as contracuenta
from public.lineas l
join public.asientos a on a.id = l.asiento_id
join public.cuentas c on c.id = l.cuenta_id;

comment on view public.movimientos is 'Una fila por línea visible para el usuario (respeta RLS).';

-- Mayor de una cuenta (incluye sus subcuentas), con saldo anterior y acumulado.
-- p_libros: 'A', 'B' o 'AB'.
create function public.mayor_cuenta(
  p_proyecto uuid,
  p_cuenta   uuid,
  p_libros   text,
  p_moneda   public.moneda,
  p_desde    date,
  p_hasta    date
)
returns table (
  fecha       date,
  numero      integer,
  asiento_id  uuid,
  detalle     text,
  cuenta      text,
  libro       public.libro_contable,
  debe        numeric,
  haber       numeric,
  saldo       numeric,
  fila        bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive arbol as (
    select c.id from public.cuentas c where c.id = p_cuenta and c.proyecto_id = p_proyecto
    union all
    select c.id from public.cuentas c join arbol on c.cuenta_padre = arbol.id
  ),
  movs as (
    select m.*,
           case when p_moneda = 'ARS' then m.importe_ars else m.importe_usd end as importe
    from public.movimientos m
    where m.proyecto_id = p_proyecto
      and m.cuenta_id in (select id from arbol)
      and (p_libros = 'AB' or m.libro::text = p_libros)
      and (p_hasta is null or m.fecha <= p_hasta)
  ),
  anterior as (
    select coalesce(sum(case when debe > 0 then importe else -importe end), 0) as saldo
    from movs where p_desde is not null and fecha < p_desde
  ),
  periodo as (
    select fecha, numero, asiento_id,
           coalesce(linea_detalle, asiento_detalle) as detalle,
           cuenta_codigo || ' ' || cuenta_nombre as cuenta,
           libro,
           case when debe > 0 then importe else 0 end as debe,
           case when haber > 0 then importe else 0 end as haber,
           orden
    from movs where p_desde is null or fecha >= p_desde
  )
  select null::date, null::integer, null::uuid, 'Saldo anterior', null::text, null::public.libro_contable,
         null::numeric, null::numeric, (select saldo from anterior), 0::bigint
  where p_desde is not null
  union all
  select p.fecha, p.numero, p.asiento_id, p.detalle, p.cuenta, p.libro, p.debe, p.haber,
         (select saldo from anterior)
           + sum(p.debe - p.haber) over (order by p.fecha, p.numero, p.libro, p.orden rows unbounded preceding),
         row_number() over (order by p.fecha, p.numero, p.libro, p.orden)
  from periodo p
  order by 10;  -- columna "fila"
$$;

-- Balance de sumas y saldos, con las cuentas madre sumando a sus subcuentas.
create function public.balance_sumas_saldos(
  p_proyecto uuid,
  p_libros   text,
  p_moneda   public.moneda,
  p_desde    date,
  p_hasta    date
)
returns table (
  cuenta_id    uuid,
  codigo       text,
  nombre       text,
  nivel        smallint,
  cuenta_padre uuid,
  tipo         public.tipo_cuenta,
  es_puente    boolean,
  debe         numeric,
  haber        numeric,
  saldo        numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive sumas as (
    select m.cuenta_id,
           sum(case when m.debe > 0 then (case when p_moneda = 'ARS' then m.importe_ars else m.importe_usd end) else 0 end) as debe,
           sum(case when m.haber > 0 then (case when p_moneda = 'ARS' then m.importe_ars else m.importe_usd end) else 0 end) as haber
    from public.movimientos m
    where m.proyecto_id = p_proyecto
      and (p_libros = 'AB' or m.libro::text = p_libros)
      and (p_desde is null or m.fecha >= p_desde)
      and (p_hasta is null or m.fecha <= p_hasta)
    group by m.cuenta_id
  ),
  -- Cada suma se propaga a la cuenta y a todas sus cuentas madre.
  propagado as (
    select c.id as cuenta_id, c.cuenta_padre, s.debe, s.haber
    from sumas s join public.cuentas c on c.id = s.cuenta_id
    union all
    select c.id, c.cuenta_padre, p.debe, p.haber
    from propagado p join public.cuentas c on c.id = p.cuenta_padre
  )
  select c.id, c.codigo, c.nombre, c.nivel, c.cuenta_padre, c.tipo, c.es_puente,
         sum(p.debe), sum(p.haber), sum(p.debe) - sum(p.haber)
  from propagado p
  join public.cuentas c on c.id = p.cuenta_id
  group by c.id
  order by c.codigo;
$$;


-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke all on function
  public.puede_ver_movimientos(uuid),
  public.puede_registrar(uuid),
  public.puede_cargar_cotizaciones(),
  public.hoy_ar(),
  public.tc_mep(date),
  public.mes_cerrado(uuid, date),
  public.fecha_ar(date),
  public.numero_ar(numeric),
  public.validar_cuenta_contable(),
  public.validar_padre_no_especial(),
  public.marcar_cotizacion(),
  public.marcar_cierre(),
  public.validar_linea(),
  public.verificar_balance_asiento(),
  public.bloquear_cambios_contables(),
  public.preparar_asiento(uuid, date, public.tipo_asiento, jsonb),
  public.previsualizar_asiento(uuid, date, public.tipo_asiento, jsonb),
  public.registrar_asiento(uuid, date, text, public.tipo_asiento, jsonb),
  public.anular_asiento(uuid, text),
  public.mayor_cuenta(uuid, uuid, text, public.moneda, date, date),
  public.balance_sumas_saldos(uuid, text, public.moneda, date, date)
from public, anon, authenticated;

grant execute on function
  public.puede_ver_movimientos(uuid),
  public.puede_registrar(uuid),
  public.puede_cargar_cotizaciones(),
  public.hoy_ar(),
  public.tc_mep(date),
  public.mes_cerrado(uuid, date),
  public.fecha_ar(date),
  public.numero_ar(numeric),
  public.previsualizar_asiento(uuid, date, public.tipo_asiento, jsonb),
  public.registrar_asiento(uuid, date, text, public.tipo_asiento, jsonb),
  public.anular_asiento(uuid, text),
  public.mayor_cuenta(uuid, uuid, text, public.moneda, date, date),
  public.balance_sumas_saldos(uuid, text, public.moneda, date, date)
to authenticated;

revoke all on public.cotizaciones, public.cierres, public.asientos, public.lineas, public.movimientos
from anon, authenticated;

grant select                        on public.cotizaciones to authenticated;
grant insert (fecha, tipo, compra, venta),
      update (fecha, tipo, compra, venta) on public.cotizaciones to authenticated;
grant select, delete                on public.cierres      to authenticated;
grant insert (proyecto_id, mes)     on public.cierres      to authenticated;
grant select                        on public.asientos     to authenticated;  -- se escriben solo por funciones
grant select                        on public.lineas       to authenticated;
grant select                        on public.movimientos  to authenticated;


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.cotizaciones enable row level security;
alter table public.cierres      enable row level security;
alter table public.asientos     enable row level security;
alter table public.lineas       enable row level security;

create policy "cotizaciones: las ve cualquier usuario"
  on public.cotizaciones for select to authenticated
  using (true);

create policy "cotizaciones: alta por administrador o contador"
  on public.cotizaciones for insert to authenticated
  with check (public.puede_cargar_cotizaciones());

create policy "cotizaciones: cambio por administrador o contador"
  on public.cotizaciones for update to authenticated
  using (public.puede_cargar_cotizaciones())
  with check (public.puede_cargar_cotizaciones());

create policy "cierres: ver si veo movimientos"
  on public.cierres for select to authenticated
  using (public.puede_ver_movimientos(proyecto_id));

create policy "cierres: cerrar por administrador"
  on public.cierres for insert to authenticated
  with check (public.es_administrador(proyecto_id));

create policy "cierres: reabrir por administrador"
  on public.cierres for delete to authenticated
  using (public.es_administrador(proyecto_id));

-- Líneas: las del libro B solo con ve_libro_b. "comercial" no ve movimientos.
create policy "lineas: ver según rol y libro"
  on public.lineas for select to authenticated
  using (
    public.puede_ver_movimientos(proyecto_id)
    and (libro = 'A' or public.ve_libro_b(proyecto_id))
  );

-- Un asiento se ve si se ve al menos una de sus líneas.
create policy "asientos: ver si veo alguna línea"
  on public.asientos for select to authenticated
  using (
    public.puede_ver_movimientos(proyecto_id)
    and exists (select 1 from public.lineas l where l.asiento_id = asientos.id)
  );
