-- =============================================================================
-- Plan de cuentas: más de 99 subcuentas bajo una misma cuenta
--
-- importar_plan_cuentas numeraba las hijas con lpad(n, 2, '0'). En Postgres lpad
-- RECORTA cuando el texto es más largo: la hija 100 quedaba "…10" y chocaba con
-- la décima (cuentas_proyecto_id_codigo_key). Ahora el ancho es de al menos 2
-- dígitos, sin recortar: …01 … …99, …100, …101.
-- Solo cambia esa línea; el resto de la función queda igual.
-- =============================================================================

create or replace function public.importar_plan_cuentas(p_proyecto uuid, p_filas jsonb)
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
  v_siguiente integer;
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
          select coalesce(max(substring(c.codigo from '\.([0-9]+)$')::integer), 0) + 1
          into v_siguiente
          from public.cuentas c
          where c.cuenta_padre = v_padre.id;
          v_codigo := v_padre.codigo || '.' || lpad(v_siguiente::text, greatest(2, length(v_siguiente::text)), '0');
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
