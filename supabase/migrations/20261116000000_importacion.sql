-- =============================================================================
-- Fase 3 · Importación del histórico (plan de cuentas + movimientos)
--
-- · Tipo de asiento "importado" con origen / origen_id (único por proyecto:
--   reimportar el mismo Excel solo agrega las filas nuevas).
-- · Lotes de importación, con "deshacer lote" (única excepción a "nada se
--   borra", y solo para asientos importados).
-- · Funciones (solo administrador): importar_plan_cuentas, iniciar_importacion,
--   importar_movimientos, finalizar_importacion, deshacer_lote.
--
-- Requiere las migraciones de las fases 1 y 2. No carga datos.
-- =============================================================================

-- El valor nuevo no se usa en este mismo script (Postgres no lo permite hasta
-- confirmar); las funciones lo nombran recién al ejecutarse.
alter type public.tipo_asiento add value if not exists 'importado';


-- -----------------------------------------------------------------------------
-- Lotes de importación
-- -----------------------------------------------------------------------------

create table public.lotes_importacion (
  id               uuid primary key default gen_random_uuid(),
  proyecto_id      uuid not null references public.proyectos (id) on delete restrict,
  archivo          text not null,
  estado           text not null default 'en_curso'
                   check (estado in ('en_curso', 'completo', 'deshecho')),
  creado_por       uuid references public.perfiles (id) on delete set null,
  creado_en        timestamptz not null default now(),
  filas_importadas integer not null default 0,
  filas_existentes integer not null default 0,  -- ya importadas antes (se saltean)
  filas_salteadas  jsonb not null default '{}'::jsonb,  -- {"sin_cuenta": n, "neto_cero": n, "relleno": n}
  total_ars        jsonb,  -- {"A": n, "B": n} suma del debe en ARS
  total_usd        jsonb,  -- {"A": n, "B": n} suma del debe en USD
  fecha_desde      date,
  fecha_hasta      date,
  finalizado_en    timestamptz,
  deshecho_por     uuid references public.perfiles (id) on delete set null,
  deshecho_en      timestamptz
);
comment on table public.lotes_importacion is 'Cada importación de movimientos desde la planilla.';
create index lotes_importacion_proyecto_idx on public.lotes_importacion (proyecto_id, creado_en desc);

alter table public.asientos
  add column origen    text,
  add column origen_id text,
  add column lote_id   uuid references public.lotes_importacion (id) on delete restrict;

comment on column public.asientos.origen is 'Importados: valor de la columna CONCILIACIÓN de la planilla.';
comment on column public.asientos.origen_id is 'Importados: valor de la columna ID de la planilla (único por proyecto).';

create unique index asientos_origen_unico on public.asientos (proyecto_id, origen_id) where origen_id is not null;
create index asientos_lote_idx on public.asientos (lote_id) where lote_id is not null;

create trigger auditar_lotes_importacion
  after insert or update or delete on public.lotes_importacion
  for each row execute function public.auditar();

alter table public.lotes_importacion enable row level security;
revoke all on public.lotes_importacion from anon, authenticated;
grant select on public.lotes_importacion to authenticated;  -- se escriben solo por funciones

create policy "lotes: los ven los administradores"
  on public.lotes_importacion for select to authenticated
  using (public.es_administrador(proyecto_id));


-- -----------------------------------------------------------------------------
-- Reglas existentes, adaptadas a los asientos importados
-- -----------------------------------------------------------------------------

-- Líneas: los importados traen ARS y USD de la planilla (no se recalculan con
-- el TC) y pueden usar la cuenta puente. El resto de las reglas sigue igual.
create or replace function public.validar_linea()
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

  if v_cuenta.es_puente and v_asiento.tipo::text not in ('traspaso_libros', 'importado') then
    raise exception 'La cuenta puente solo se usa en traspasos entre libros.'
      using errcode = 'check_violation';
  end if;

  if new.moneda = 'ARS' then
    if new.importe_ars <> new.importe_origen then
      raise exception 'Línea en ARS: el importe en pesos tiene que ser igual al importe de origen.';
    end if;
    v_exacto := new.importe_origen / new.tc;
    if v_asiento.tipo::text <> 'importado' and not v_cuenta.es_diferencia_cambio
       and abs(new.importe_usd - v_exacto) >= 0.01 then
      raise exception 'Línea en ARS: el importe en USD (%) no corresponde al TC %.', new.importe_usd, new.tc;
    end if;
  else
    if new.importe_usd <> new.importe_origen then
      raise exception 'Línea en USD: el importe en dólares tiene que ser igual al importe de origen.';
    end if;
    v_exacto := new.importe_origen * new.tc;
    if v_asiento.tipo::text <> 'importado' and not v_cuenta.es_diferencia_cambio
       and abs(new.importe_ars - v_exacto) >= 0.01 then
      raise exception 'Línea en USD: el importe en ARS (%) no corresponde al TC %.', new.importe_ars, new.tc;
    end if;
  end if;

  return new;
end;
$$;

-- Nada se borra ni se modifica, con una sola excepción: deshacer_lote() borra
-- los asientos importados de un lote (marca la transacción con
-- paralelo.deshacer_lote = id del lote).
create or replace function public.bloquear_cambios_contables()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lote text := nullif(current_setting('paralelo.deshacer_lote', true), '');
begin
  if tg_table_name = 'asientos' and tg_op = 'UPDATE' then
    if old.estado = 'registrado' and new.estado = 'anulado'
       and (to_jsonb(new) - 'estado') = (to_jsonb(old) - 'estado') then
      return new;  -- marcarlo como anulado
    end if;
  end if;

  -- (Condiciones anidadas: plpgsql no corta la evaluación y "old" cambia según la tabla.)
  if tg_op = 'DELETE' and v_lote is not null then
    if tg_table_name = 'asientos' then
      if old.tipo::text = 'importado' and old.lote_id::text = v_lote then
        return old;
      end if;
    elsif tg_table_name = 'lineas' then
      if exists (
        select 1 from public.asientos a
        where a.id = old.asiento_id and a.tipo::text = 'importado' and a.lote_id::text = v_lote
      ) then
        return old;
      end if;
    end if;
  end if;

  raise exception 'Los asientos y sus líneas no se modifican ni se borran: se anulan con un contra-asiento.'
    using errcode = 'insufficient_privilege';
end;
$$;


-- Auditoría: un asiento borrado (por deshacer un lote) ya no tiene líneas para
-- decidir si se ve; se usa el registro de auditoría de sus líneas.
create function public.asiento_auditado_visible(p_proyecto uuid, p_asiento text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.auditoria au
    where au.proyecto_id = p_proyecto
      and au.tabla = 'lineas'
      and coalesce(au.antes, au.despues) ->> 'asiento_id' = p_asiento
      and (coalesce(au.antes, au.despues) ->> 'libro' = 'A' or public.ve_libro_b(p_proyecto))
  );
$$;

revoke all on function public.asiento_auditado_visible(uuid, text) from public, anon, authenticated;
grant execute on function public.asiento_auditado_visible(uuid, text) to authenticated;

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
        or public.asiento_auditado_visible(proyecto_id, registro_id)
      else true
    end
  );


-- -----------------------------------------------------------------------------
-- Plan de cuentas desde la hoja "BASE MOVIMIENTOS"
--
-- p_filas: [{"n1": "...", "n2": "...", "n3": "...", "n4": "...", "computa": true}, ...]
-- Arma el árbol por camino. Si una cuenta ya existe (mismo camino, sin distinguir
-- mayúsculas ni espacios de más) se deja como está.
-- -----------------------------------------------------------------------------

create function public.normalizar_nombre(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(p_texto, '')), '\s+', ' ', 'g'));
$$;

create function public.importar_plan_cuentas(p_proyecto uuid, p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fila     jsonb;
  v_nombres  text[];
  v_nivel    integer;
  v_padre    public.cuentas%rowtype;
  v_cuenta   public.cuentas%rowtype;
  v_tipo     public.tipo_cuenta;
  v_codigo   text;
  v_n1       text;
  v_rubro    text;
  v_computa  boolean;
  v_creadas  integer := 0;
  v_existian integer := 0;
  v_avisos   text[] := '{}';
  v_especial record;
  v_hoja_id  uuid;
begin
  if not public.es_administrador(p_proyecto) then
    raise exception 'Solo un administrador del proyecto puede importar el plan de cuentas.'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Las filas tienen que venir en una lista.';
  end if;

  -- Las dos cuentas especiales se agregan como filas más.
  p_filas := p_filas || jsonb_build_array(
    jsonb_build_object('n1', '3. CAPITAL', 'n2', 'AJUSTES ENTRE LIBROS', 'n3', 'TRASPASOS',
                       'n4', 'TRASPASOS ENTRE LIBROS', 'computa', true, 'especial', 'puente'),
    jsonb_build_object('n1', 'G - OTROS INGRESOS', 'n2', 'RESULTADOS FINANCIEROS', 'n3', 'DIFERENCIA DE CAMBIO',
                       'n4', 'DIFERENCIA DE CAMBIO', 'computa', true, 'especial', 'diferencia'));

  -- No se puede tener dos cuentas puente (o de diferencia): si ya hay una en otro
  -- lugar, se avisa antes de crear nada.
  for v_especial in
    select x.especial, x.camino
    from (values ('puente', '3. CAPITAL > AJUSTES ENTRE LIBROS > TRASPASOS > TRASPASOS ENTRE LIBROS'),
                 ('diferencia', 'G - OTROS INGRESOS > RESULTADOS FINANCIEROS > DIFERENCIA DE CAMBIO > DIFERENCIA DE CAMBIO')
         ) as x(especial, camino)
  loop
    select c.* into v_cuenta from public.cuentas c
    where c.proyecto_id = p_proyecto
      and ((v_especial.especial = 'puente' and c.es_puente)
        or (v_especial.especial = 'diferencia' and c.es_diferencia_cambio));
    if found then
      -- ¿Está en el camino esperado? Se reconstruye el camino de la cuenta existente.
      with recursive camino as (
        select c.id, c.cuenta_padre, public.normalizar_nombre(c.nombre) as nombre, 1 as prof
        from public.cuentas c where c.id = v_cuenta.id
        union all
        select c.id, c.cuenta_padre, public.normalizar_nombre(c.nombre), camino.prof + 1
        from public.cuentas c join camino on c.id = camino.cuenta_padre
      )
      select case when string_agg(nombre, ' > ' order by prof desc) = v_especial.camino then v_cuenta.id end
      into v_hoja_id from camino;
      if v_hoja_id is null then
        raise exception 'Ya hay una cuenta % en otro lugar del plan (% %). Si la creaste a mano y no tiene movimientos, borrala desde "Plan de cuentas" y volvé a importar.',
          case v_especial.especial when 'puente' then 'puente' else 'de diferencia de cambio' end,
          v_cuenta.codigo, v_cuenta.nombre;
      end if;
    end if;
  end loop;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_nombres := array_remove(array[
      nullif(btrim(regexp_replace(coalesce(v_fila ->> 'n1', ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_fila ->> 'n2', ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_fila ->> 'n3', ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_fila ->> 'n4', ''), '\s+', ' ', 'g')), '')
    ], null);
    continue when cardinality(v_nombres) = 0;

    v_computa := coalesce((v_fila ->> 'computa')::boolean, true);
    v_n1 := public.normalizar_nombre(v_nombres[1]);
    v_tipo := case
      when v_n1 like '1.%' or v_n1 like '1 %' then 'activo'
      when v_n1 like '2.%' or v_n1 like '2 %' then 'pasivo'
      when v_n1 like '3.%' or v_n1 like '3 %' then 'patrimonio_neto'
      when v_n1 ~ '^[IGJ]\s*-' then 'ingreso'
      else 'egreso'
    end::public.tipo_cuenta;
    -- En "B - COSTO CONSTRUCCIÓN" el rubro de obra es el NIVEL 2.
    v_rubro := case when v_n1 ~ '^B\s*-' and cardinality(v_nombres) >= 2 then v_nombres[2] end;

    v_padre := null;
    for v_nivel in 1 .. cardinality(v_nombres) loop
      select c.* into v_cuenta from public.cuentas c
      where c.proyecto_id = p_proyecto
        and c.cuenta_padre is not distinct from v_padre.id
        and public.normalizar_nombre(c.nombre) = public.normalizar_nombre(v_nombres[v_nivel])
      order by c.codigo
      limit 1;

      if found then
        if v_nivel = cardinality(v_nombres) then v_existian := v_existian + 1; end if;
      else
        if v_nivel = 1 then
          -- Prefijo del nombre: "1. ACTIVO" → 1, "A - TERRENO" → A.
          v_codigo := substring(v_nombres[1] from '^\s*([0-9]+|[A-Za-z])\s*[.\-)]');
          v_codigo := upper(coalesce(v_codigo, ''));
          if v_codigo = '' or exists (
            select 1 from public.cuentas c where c.proyecto_id = p_proyecto and c.codigo = v_codigo
          ) then
            -- Sin prefijo (o ya usado): siguiente número libre de nivel 1.
            select coalesce(max(c.codigo::integer), 0) + 1 into v_codigo
            from public.cuentas c
            where c.proyecto_id = p_proyecto and c.nivel = 1 and c.codigo ~ '^[0-9]+$';
            v_codigo := v_codigo::text;
          end if;
        else
          select v_padre.codigo || '.' || lpad((coalesce(max(substring(c.codigo from '\.([0-9]+)$')::integer), 0) + 1)::text, 2, '0')
          into v_codigo
          from public.cuentas c
          where c.cuenta_padre = v_padre.id;
        end if;

        insert into public.cuentas (proyecto_id, codigo, nombre, nivel, cuenta_padre, tipo, computa, rubro_obra,
                                    es_puente, es_diferencia_cambio)
        values (p_proyecto, v_codigo, v_nombres[v_nivel], v_nivel, v_padre.id, v_tipo,
                case when v_nivel = cardinality(v_nombres) then v_computa else true end,
                case when v_nivel >= 2 then v_rubro end,
                coalesce(v_nivel = cardinality(v_nombres) and (v_fila ->> 'especial') = 'puente', false),
                coalesce(v_nivel = cardinality(v_nombres) and (v_fila ->> 'especial') = 'diferencia', false))
        returning * into v_cuenta;
        v_creadas := v_creadas + 1;
      end if;

      -- Si la cuenta especial ya existía en su lugar sin la marca, se la pone.
      if v_nivel = cardinality(v_nombres) and (v_fila ->> 'especial') is not null
         and not (v_cuenta.es_puente or v_cuenta.es_diferencia_cambio) then
        update public.cuentas
        set es_puente = (v_fila ->> 'especial') = 'puente',
            es_diferencia_cambio = (v_fila ->> 'especial') = 'diferencia'
        where id = v_cuenta.id;
      end if;

      v_padre := v_cuenta;
    end loop;
  end loop;

  return jsonb_build_object('creadas', v_creadas, 'existian', v_existian, 'avisos', to_jsonb(v_avisos));
end;
$$;


-- -----------------------------------------------------------------------------
-- Movimientos desde la hoja "MOVIMIENTOS"
-- -----------------------------------------------------------------------------

create function public.iniciar_importacion(p_proyecto uuid, p_archivo text, p_salteadas jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.es_administrador(p_proyecto) then
    raise exception 'Solo un administrador del proyecto puede importar movimientos.'
      using errcode = 'insufficient_privilege';
  end if;
  insert into public.lotes_importacion (proyecto_id, archivo, creado_por, filas_salteadas)
  values (p_proyecto, coalesce(nullif(btrim(p_archivo), ''), 'sin nombre'), (select auth.uid()),
          coalesce(p_salteadas, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- p_lote: {"lote_id": "...", "filas": [
--   {"id": "123", "origen": "...", "fecha": "aaaa-mm-dd", "detalle": "...",
--    "libro": "A"|"B", "cuenta_id": "...", "contracuenta_id": "...",
--    "neto": "-1234.56", "usd": "-1.23", "tc": "1003.5", "tc_manual": true,
--    "moneda_cuenta": "ARS"|"USD", "moneda_contracuenta": "ARS"|"USD"}, ...]}
-- Todo o nada: si una fila falla, no se guarda ninguna de la tanda.
create function public.importar_movimientos(p_proyecto uuid, p_lote jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote_id    uuid := nullif(p_lote ->> 'lote_id', '')::uuid;
  v_lote       public.lotes_importacion%rowtype;
  v_ve_b       boolean := public.ve_libro_b(p_proyecto);
  v_fila       jsonb;
  v_i          integer := 0;
  v_id_origen  text;
  v_fecha      date;
  v_libro      public.libro_contable;
  v_neto       numeric;
  v_usd        numeric;
  v_tc         numeric;
  v_cuenta     uuid;
  v_contra     uuid;
  v_debe       uuid;
  v_haber      uuid;
  v_mon_debe   public.moneda;
  v_mon_haber  public.moneda;
  v_numero     integer;
  v_asiento    uuid;
  v_nuevas     integer := 0;
  v_existentes integer := 0;
begin
  if not public.es_administrador(p_proyecto) then
    raise exception 'Solo un administrador del proyecto puede importar movimientos.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_lote from public.lotes_importacion l where l.id = v_lote_id and l.proyecto_id = p_proyecto;
  if not found then
    raise exception 'El lote de importación no existe en este proyecto.';
  end if;
  if v_lote.estado = 'deshecho' then
    raise exception 'El lote ya fue deshecho: empezá una importación nueva.';
  end if;

  perform 1 from public.proyectos p where p.id = p_proyecto for update;
  select coalesce(max(a.numero), 0) into v_numero from public.asientos a where a.proyecto_id = p_proyecto;

  for v_fila in select * from jsonb_array_elements(coalesce(p_lote -> 'filas', '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_id_origen := nullif(btrim(v_fila ->> 'id'), '');
    if v_id_origen is null then
      raise exception 'Fila %: falta el ID.', v_i;
    end if;

    -- Ya importada en otra ocasión: se saltea.
    if exists (select 1 from public.asientos a where a.proyecto_id = p_proyecto and a.origen_id = v_id_origen) then
      v_existentes := v_existentes + 1;
      continue;
    end if;

    begin
      v_fecha := (v_fila ->> 'fecha')::date;
    exception when others then
      raise exception 'ID %: fecha inválida.', v_id_origen;
    end;
    if v_fecha is null then
      raise exception 'ID %: fecha inválida.', v_id_origen;
    end if;
    if public.mes_cerrado(p_proyecto, v_fecha) then
      raise exception 'ID %: el mes de % está cerrado.', v_id_origen, public.fecha_ar(v_fecha);
    end if;

    v_libro := nullif(v_fila ->> 'libro', '')::public.libro_contable;
    if v_libro is null then
      raise exception 'ID %: falta el libro (KK/BB).', v_id_origen;
    end if;
    if v_libro = 'B' and not v_ve_b then
      raise exception 'ID %: no tenés acceso al libro B.', v_id_origen using errcode = 'insufficient_privilege';
    end if;

    v_neto := round(nullif(v_fila ->> 'neto', '')::numeric, 2);
    v_usd  := round(nullif(v_fila ->> 'usd', '')::numeric, 2);
    v_tc   := round(nullif(v_fila ->> 'tc', '')::numeric, 4);
    if v_neto is null or v_neto = 0 then
      raise exception 'ID %: el NETO es cero o está vacío.', v_id_origen;
    end if;
    if v_usd is null or v_usd = 0 then
      raise exception 'ID %: USD es cero con NETO distinto de cero.', v_id_origen;
    end if;
    if v_tc is null or v_tc <= 0 then
      raise exception 'ID %: falta el tipo de cambio.', v_id_origen;
    end if;

    v_cuenta := nullif(v_fila ->> 'cuenta_id', '')::uuid;
    v_contra := nullif(v_fila ->> 'contracuenta_id', '')::uuid;
    if not exists (select 1 from public.cuentas c where c.id = v_cuenta and c.proyecto_id = p_proyecto)
       or not exists (select 1 from public.cuentas c where c.id = v_contra and c.proyecto_id = p_proyecto) then
      raise exception 'ID %: la cuenta o la contracuenta no existe en el plan de este proyecto.', v_id_origen;
    end if;

    -- NETO > 0: debe en CUENTA y haber en CONTRACUENTA; NETO < 0, al revés.
    if v_neto > 0 then
      v_debe := v_cuenta;  v_mon_debe  := coalesce(nullif(v_fila ->> 'moneda_cuenta', ''), 'ARS')::public.moneda;
      v_haber := v_contra; v_mon_haber := coalesce(nullif(v_fila ->> 'moneda_contracuenta', ''), 'ARS')::public.moneda;
    else
      v_debe := v_contra;  v_mon_debe  := coalesce(nullif(v_fila ->> 'moneda_contracuenta', ''), 'ARS')::public.moneda;
      v_haber := v_cuenta; v_mon_haber := coalesce(nullif(v_fila ->> 'moneda_cuenta', ''), 'ARS')::public.moneda;
    end if;
    v_neto := abs(v_neto);
    v_usd := abs(v_usd);

    v_numero := v_numero + 1;
    insert into public.asientos (proyecto_id, numero, fecha, detalle, tipo, creado_por, origen, origen_id, lote_id)
    values (p_proyecto, v_numero, v_fecha,
            coalesce(nullif(btrim(v_fila ->> 'detalle'), ''), 'Importado (ID ' || v_id_origen || ')'),
            'importado', (select auth.uid()),
            nullif(btrim(v_fila ->> 'origen'), ''), v_id_origen, v_lote_id)
    returning id into v_asiento;

    -- Importes tal como vienen de la planilla: |NETO| en pesos y |USD| en dólares.
    insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, debe, haber, moneda,
                               importe_origen, tc, tc_manual, tc_referencia, importe_ars, importe_usd)
    values
      (v_asiento, p_proyecto, 1, v_debe, v_libro,
       case when v_mon_debe = 'USD' then v_usd else v_neto end, 0, v_mon_debe,
       case when v_mon_debe = 'USD' then v_usd else v_neto end,
       v_tc, coalesce((v_fila ->> 'tc_manual')::boolean, false), public.tc_mep(v_fecha), v_neto, v_usd),
      (v_asiento, p_proyecto, 2, v_haber, v_libro,
       0, case when v_mon_haber = 'USD' then v_usd else v_neto end, v_mon_haber,
       case when v_mon_haber = 'USD' then v_usd else v_neto end,
       v_tc, coalesce((v_fila ->> 'tc_manual')::boolean, false), public.tc_mep(v_fecha), v_neto, v_usd);

    v_nuevas := v_nuevas + 1;
  end loop;

  update public.lotes_importacion
  set filas_importadas = filas_importadas + v_nuevas,
      filas_existentes = filas_existentes + v_existentes
  where id = v_lote_id;

  return jsonb_build_object('importadas', v_nuevas, 'existentes', v_existentes);
end;
$$;

-- Cierra el lote con sus totales (suma del debe por libro).
create function public.finalizar_importacion(p_lote uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote public.lotes_importacion%rowtype;
begin
  select * into v_lote from public.lotes_importacion l where l.id = p_lote;
  if not found or not public.es_administrador(v_lote.proyecto_id) then
    raise exception 'Solo un administrador del proyecto puede cerrar el lote.' using errcode = 'insufficient_privilege';
  end if;

  update public.lotes_importacion l
  set estado = case when l.estado = 'deshecho' then l.estado else 'completo' end,
      finalizado_en = now(),
      total_ars = t.ars,
      total_usd = t.usd,
      fecha_desde = t.desde,
      fecha_hasta = t.hasta
  from (
    select coalesce(jsonb_object_agg(x.libro, x.ars), '{}'::jsonb) as ars,
           coalesce(jsonb_object_agg(x.libro, x.usd), '{}'::jsonb) as usd,
           min(x.desde) as desde, max(x.hasta) as hasta
    from (
      select li.libro::text as libro,
             sum(li.importe_ars) filter (where li.debe > 0) as ars,
             sum(li.importe_usd) filter (where li.debe > 0) as usd,
             min(a.fecha) as desde, max(a.fecha) as hasta
      from public.asientos a
      join public.lineas li on li.asiento_id = a.id
      where a.lote_id = p_lote
      group by li.libro
    ) x
  ) t
  where l.id = p_lote
  returning * into v_lote;

  return to_jsonb(v_lote);
end;
$$;

-- Deshacer un lote: borra sus asientos importados (queda la constancia en la
-- auditoría) y marca el lote como deshecho.
create function public.deshacer_lote(p_lote uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lote    public.lotes_importacion%rowtype;
  v_mes     date;
  v_borrados integer;
begin
  select * into v_lote from public.lotes_importacion l where l.id = p_lote for update;
  if not found or not public.es_administrador(v_lote.proyecto_id) then
    raise exception 'Solo un administrador del proyecto puede deshacer un lote.' using errcode = 'insufficient_privilege';
  end if;
  if v_lote.estado = 'deshecho' then
    raise exception 'El lote ya estaba deshecho.';
  end if;

  select min(c.mes) into v_mes
  from public.cierres c
  where c.proyecto_id = v_lote.proyecto_id
    and c.mes in (select distinct date_trunc('month', a.fecha)::date from public.asientos a where a.lote_id = p_lote);
  if v_mes is not null then
    raise exception 'No se puede deshacer: el lote tiene asientos de un mes cerrado (%).', to_char(v_mes, 'MM/YYYY');
  end if;

  if exists (select 1 from public.asientos a where a.lote_id = p_lote and a.estado = 'anulado') then
    raise exception 'No se puede deshacer: algún asiento del lote ya fue anulado con un contra-asiento.';
  end if;

  if not public.ve_libro_b(v_lote.proyecto_id)
     and exists (select 1 from public.lineas li join public.asientos a on a.id = li.asiento_id
                 where a.lote_id = p_lote and li.libro = 'B') then
    raise exception 'El lote tiene asientos del libro B: solo lo puede deshacer quien ve ese libro.'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('paralelo.deshacer_lote', p_lote::text, true);
  delete from public.lineas li using public.asientos a where li.asiento_id = a.id and a.lote_id = p_lote;
  delete from public.asientos a where a.lote_id = p_lote;
  get diagnostics v_borrados = row_count;
  perform set_config('paralelo.deshacer_lote', '', true);

  update public.lotes_importacion
  set estado = 'deshecho', deshecho_por = (select auth.uid()), deshecho_en = now()
  where id = p_lote;

  return jsonb_build_object('asientos_borrados', v_borrados);
end;
$$;


-- -----------------------------------------------------------------------------
-- Permisos de las funciones nuevas
-- -----------------------------------------------------------------------------

revoke all on function
  public.normalizar_nombre(text),
  public.importar_plan_cuentas(uuid, jsonb),
  public.iniciar_importacion(uuid, text, jsonb),
  public.importar_movimientos(uuid, jsonb),
  public.finalizar_importacion(uuid),
  public.deshacer_lote(uuid)
from public, anon, authenticated;

grant execute on function
  public.normalizar_nombre(text),
  public.importar_plan_cuentas(uuid, jsonb),
  public.iniciar_importacion(uuid, text, jsonb),
  public.importar_movimientos(uuid, jsonb),
  public.finalizar_importacion(uuid),
  public.deshacer_lote(uuid)
to authenticated;
