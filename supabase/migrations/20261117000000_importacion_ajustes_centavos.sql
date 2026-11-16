-- =============================================================================
-- Fase 3 · Ajuste: filas de centavos sin equivalente en USD
--
-- En la planilla hay ajustes de centavos en pesos cuyo USD redondeado a dos
-- decimales da 0. Regla nueva de importar_movimientos:
--   · USD = 0 y NETO ≠ 0, con las dos cuentas en pesos: se importa con
--     importe_ars = |NETO| e importe_usd = 0 en las dos líneas (el asiento sigue
--     balanceando en ARS y en USD).
--   · Si alguna de las dos cuentas es en dólares, sigue siendo error.
-- Además, la moneda de cada línea la decide la base por el nombre de la cuenta
-- (contiene "USD"), y si la fila no trae TC se usa el MEP del día.
--
-- La tabla lineas ya lo admite (importe_usd >= 0; importe_origen > 0 es |NETO|
-- en las líneas en pesos) y validar_linea no exige coherencia con el TC en los
-- asientos importados: solo cambia esta función.
--
-- Requiere 20261116000000_importacion.sql.
-- =============================================================================

-- p_lote: {"lote_id": "...", "filas": [
--   {"id": "123", "origen": "...", "fecha": "aaaa-mm-dd", "detalle": "...",
--    "libro": "A"|"B", "cuenta_id": "...", "contracuenta_id": "...",
--    "neto": "-1234.56", "usd": "-1.23", "tc": "1003.5", "tc_manual": true,
--    "moneda_cuenta": ..., "moneda_contracuenta": ...}, ...]}
-- (moneda_cuenta y moneda_contracuenta se ignoran: la moneda sale del nombre de la cuenta.)
-- Todo o nada: si una fila falla, no se guarda ninguna de la tanda.
create or replace function public.importar_movimientos(p_proyecto uuid, p_lote jsonb)
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
  v_mon_cuenta public.moneda;
  v_mon_contra public.moneda;
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
    if v_usd is null then
      raise exception 'ID %: falta el importe en USD.', v_id_origen;
    end if;
    -- Sin TC en la planilla: MEP del día (o del último día anterior).
    v_tc := coalesce(v_tc, public.tc_mep(v_fecha));
    if v_tc is null or v_tc <= 0 then
      raise exception 'ID %: falta el tipo de cambio.', v_id_origen;
    end if;

    v_cuenta := nullif(v_fila ->> 'cuenta_id', '')::uuid;
    v_contra := nullif(v_fila ->> 'contracuenta_id', '')::uuid;
    if not exists (select 1 from public.cuentas c where c.id = v_cuenta and c.proyecto_id = p_proyecto)
       or not exists (select 1 from public.cuentas c where c.id = v_contra and c.proyecto_id = p_proyecto) then
      raise exception 'ID %: la cuenta o la contracuenta no existe en el plan de este proyecto.', v_id_origen;
    end if;

    -- Moneda de cada línea: USD si el nombre de la cuenta contiene "USD" (lo
    -- decide la base, no el navegador).
    select case when public.normalizar_nombre(c.nombre) like '%USD%' then 'USD' else 'ARS' end::public.moneda
    into v_mon_cuenta from public.cuentas c where c.id = v_cuenta;
    select case when public.normalizar_nombre(c.nombre) like '%USD%' then 'USD' else 'ARS' end::public.moneda
    into v_mon_contra from public.cuentas c where c.id = v_contra;

    -- Ajustes de centavos: USD = 0 (a dos decimales) se acepta solo si las dos
    -- cuentas son en pesos; una línea en USD no puede tener importe 0.
    if v_usd = 0 and 'USD' in (v_mon_cuenta, v_mon_contra) then
      raise exception 'ID %: USD es cero y una de las cuentas es en dólares (una línea en USD no puede tener importe 0).',
        v_id_origen;
    end if;

    -- NETO > 0: debe en CUENTA y haber en CONTRACUENTA; NETO < 0, al revés.
    if v_neto > 0 then
      v_debe := v_cuenta;  v_mon_debe  := v_mon_cuenta;
      v_haber := v_contra; v_mon_haber := v_mon_contra;
    else
      v_debe := v_contra;  v_mon_debe  := v_mon_contra;
      v_haber := v_cuenta; v_mon_haber := v_mon_cuenta;
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
