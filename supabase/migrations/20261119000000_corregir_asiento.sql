-- =============================================================================
-- Corregir un asiento
--
-- Los asientos no se editan: se anulan con un contra-asiento. corregir_asiento
-- hace en una sola transacción lo que antes eran dos pasos a mano:
--   1. Anula el original con un contra-asiento EN LA MISMA FECHA del original
--      (así los saldos de ese mes quedan corregidos, no solo los de hoy).
--   2. Registra el asiento corregido con registrar_asiento (mismas validaciones
--      que una carga nueva: partida doble, mes abierto, libro B, etc.).
-- Si algo falla, no se hace ninguna de las dos cosas.
--
-- Además: se marca como "deshecho" un lote de importación que quedó "en curso"
-- sin ningún asiento (un intento que no llegó a importar nada).
-- =============================================================================

create function public.corregir_asiento(
  p_asiento  uuid,
  p_motivo   text,
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
  v_original public.asientos%rowtype;
  v_id       uuid;
  v_numero   integer;
  v_nuevo    jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_original from public.asientos a where a.id = p_asiento;
  if not found or not public.puede_ver_movimientos(v_original.proyecto_id) then
    raise exception 'El asiento no existe.';
  end if;
  if not public.puede_registrar(v_original.proyecto_id) then
    raise exception 'Solo un administrador o un contador del proyecto puede corregir asientos.'
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indicá el motivo de la corrección.';
  end if;
  if v_original.estado = 'anulado' then
    raise exception 'El asiento % ya está anulado.', v_original.numero;
  end if;
  if v_original.anula_a is not null then
    raise exception 'El asiento % es una anulación: no se puede corregir.', v_original.numero;
  end if;
  if not public.ve_libro_b(v_original.proyecto_id)
     and exists (select 1 from public.lineas l where l.asiento_id = p_asiento and l.libro = 'B') then
    raise exception 'El asiento tiene líneas del libro B: solo lo puede corregir quien ve ese libro.'
      using errcode = 'insufficient_privilege';
  end if;
  if public.mes_cerrado(v_original.proyecto_id, v_original.fecha) then
    raise exception 'El mes del asiento (%) está cerrado: no se puede corregir. Anulalo y cargá el ajuste en un mes abierto.',
      to_char(v_original.fecha, 'MM/YYYY');
  end if;

  -- El contra-asiento toma el número siguiente y el corregido el que le sigue
  -- (el proyecto queda bloqueado hasta confirmar).
  perform 1 from public.proyectos p where p.id = v_original.proyecto_id for update;
  select coalesce(max(a.numero), 0) + 1 into v_numero
  from public.asientos a where a.proyecto_id = v_original.proyecto_id;

  insert into public.asientos (proyecto_id, numero, fecha, detalle, tipo, anula_a, motivo_anulacion, creado_por)
  values (v_original.proyecto_id, v_numero, v_original.fecha,
          'Corrección del asiento ' || v_original.numero || ' (reemplazado por el ' || (v_numero + 1) || '): '
            || btrim(p_motivo),
          v_original.tipo, v_original.id, btrim(p_motivo), (select auth.uid()))
  returning id into v_id;

  insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, debe, haber, moneda,
                             importe_origen, tc, tc_manual, tc_referencia, importe_ars, importe_usd, detalle)
  select v_id, l.proyecto_id, l.orden, l.cuenta_id, l.libro, l.haber, l.debe, l.moneda,
         l.importe_origen, l.tc, l.tc_manual, l.tc_referencia, l.importe_ars, l.importe_usd, l.detalle
  from public.lineas l
  where l.asiento_id = v_original.id;

  update public.asientos set estado = 'anulado' where id = v_original.id;

  v_nuevo := public.registrar_asiento(v_original.proyecto_id, p_fecha, p_detalle, p_tipo, p_lineas);

  return jsonb_build_object('anulacion', v_numero, 'id', v_nuevo ->> 'id', 'numero', (v_nuevo ->> 'numero')::integer);
end;
$$;

comment on function public.corregir_asiento(uuid, text, date, text, public.tipo_asiento, jsonb) is
  'Anula un asiento (contra-asiento en su misma fecha) y registra el corregido, todo en una transacción.';

revoke all on function public.corregir_asiento(uuid, text, date, text, public.tipo_asiento, jsonb) from public, anon;
grant execute on function public.corregir_asiento(uuid, text, date, text, public.tipo_asiento, jsonb) to authenticated;


-- Lotes que quedaron "en curso" sin asientos: no importaron nada.
update public.lotes_importacion l
set estado = 'deshecho', deshecho_en = now()
where l.estado = 'en_curso'
  and not exists (select 1 from public.asientos a where a.lote_id = l.id);
