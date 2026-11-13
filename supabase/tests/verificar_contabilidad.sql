-- =============================================================================
-- Verificación de la contabilidad (fase 2)
--
-- Cómo usarlo: pegá todo este archivo en el SQL Editor de Supabase y tocá Run.
-- Requiere las migraciones de las fases 1 y 2.
--
-- Qué hace: crea un proyecto de prueba con cinco usuarios (administrador con
-- libro B, administrador sin libro B, contador sin libro B, lectura y
-- comercial), un plan de cuentas mínimo y una cotización de prueba, y comprueba
-- las reglas contables y los permisos.
--
-- Cómo leer el resultado: igual que verificar_rls.sql, el script SIEMPRE termina
-- con un mensaje en rojo. Es a propósito: así Postgres deshace todo y no queda
-- ningún rastro (usuarios, proyecto, asientos ni auditoría).
--   · "VERIFICACIÓN CONTABLE SUPERADA" → todo bien.
--   · "VERIFICACIÓN CONTABLE FALLIDA"  → el mensaje lista qué prueba falló.
-- =============================================================================

do $$
declare
  -- Usuarios de prueba
  v_adm     uuid := gen_random_uuid();  -- administrador, ve libro B
  v_adm2    uuid := gen_random_uuid();  -- administrador, NO ve libro B
  v_cont    uuid := gen_random_uuid();  -- contador, NO ve libro B
  v_lect    uuid := gen_random_uuid();  -- lectura
  v_com     uuid := gen_random_uuid();  -- comercial
  v_p       uuid;
  -- Cuentas
  v_caja_ars uuid; v_caja_usd uuid; v_gasto uuid; v_puente uuid; v_dif uuid; v_activo uuid; v_egreso uuid;
  -- Fechas: un mes viejo para no chocar con cotizaciones reales
  v_fecha   date := date '2001-03-15';
  v_hoy     date := public.hoy_ar();
  v_res     jsonb;
  v_id      uuid;
  v_id_b    uuid;
  v_id_tr   uuid;
  v_n       bigint;
  v_num     numeric;
  v_num2    numeric;
  v_txt     text;
  v_ok      text[] := '{}';
  v_fallas  text[] := '{}';
  v_prueba  text;
  v_lineas_pago jsonb;
begin
  -- ---------------------------------------------------------------------------
  -- Preparación (como administrador de la base)
  -- ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
         'prueba-contable-' || u || '@ejemplo.invalid', '{}', '{}', now(), now()
  from unnest(array[v_adm, v_adm2, v_cont, v_lect, v_com]) as u;

  insert into public.proyectos (nombre, figura) values ('Prueba contable', 'propio') returning id into v_p;

  insert into public.miembros (proyecto_id, usuario_id, rol, ve_libro_b) values
    (v_p, v_adm,  'administrador', true),
    (v_p, v_adm2, 'administrador', false),
    (v_p, v_cont, 'contador',      false),
    (v_p, v_lect, 'lectura',       true),
    (v_p, v_com,  'comercial',     true);

  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo) values (v_p, '1', 'Activo', 1, 'activo') returning id into v_activo;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo) values (v_p, '5', 'Egresos', 1, 'egreso') returning id into v_egreso;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, cuenta_padre) values (v_p, '1.1', 'Caja ARS', 2, 'activo', v_activo) returning id into v_caja_ars;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, cuenta_padre) values (v_p, '1.2', 'Caja USD', 2, 'activo', v_activo) returning id into v_caja_usd;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, cuenta_padre) values (v_p, '5.1', 'Gastos', 2, 'egreso', v_egreso) returning id into v_gasto;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, es_puente) values (v_p, '9', 'Traspasos entre libros', 1, 'activo', true) returning id into v_puente;
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, es_diferencia_cambio) values (v_p, '8', 'Diferencia de cambio', 1, 'ingreso', true) returning id into v_dif;

  -- Cotización de prueba en una fecha vieja (si ya existiera, se usa la existente).
  insert into public.cotizaciones (fecha, tipo, compra, venta, fuente)
  values (v_fecha - 2, 'mep', 1.0, 1.0, 'prueba')
  on conflict (fecha, tipo) do nothing;

  -- Mes cerrado para la prueba: febrero de 2001.
  insert into public.cierres (proyecto_id, mes) values (v_p, date '2001-02-01');

  v_lineas_pago := jsonb_build_array(
    jsonb_build_object('cuenta_id', v_gasto,    'libro', 'A', 'lado', 'debe',  'importe', '1000', 'moneda', 'ARS', 'tc', '1000'),
    jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'A', 'lado', 'haber', 'importe', '1000', 'moneda', 'ARS', 'tc', '1000'));

  -- ---------------------------------------------------------------------------
  -- Como administrador con libro B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '1. Asiento desbalanceado: rechazado';
  begin
    perform public.registrar_asiento(v_p, v_fecha, 'Desbalanceado', 'manual', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_gasto,    'libro', 'A', 'lado', 'debe',  'importe', '100', 'moneda', 'ARS', 'tc', '1000'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'A', 'lado', 'haber', 'importe', '90',  'moneda', 'ARS', 'tc', '1000')));
    v_fallas := v_fallas || v_prueba;
  exception when others then
    if sqlerrm like '%no balancea%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  v_prueba := '2. Asiento en un mes cerrado: rechazado';
  begin
    perform public.registrar_asiento(v_p, date '2001-02-10', 'En mes cerrado', 'pago', v_lineas_pago);
    v_fallas := v_fallas || v_prueba;
  exception when others then
    if sqlerrm like '%cerrado%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  v_prueba := '3. Pago correcto: registrado con número 1 y TC del MEP';
  begin
    v_res := public.registrar_asiento(v_p, v_fecha, 'Pago de prueba', 'pago', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_gasto,    'libro', 'A', 'lado', 'debe',  'importe', '1000', 'moneda', 'ARS'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'A', 'lado', 'haber', 'importe', '1000', 'moneda', 'ARS')));
    v_id := (v_res ->> 'id')::uuid;
    select count(*) into v_n from public.lineas
    where asiento_id = v_id and tc = public.tc_mep(v_fecha) and not tc_manual and tc_referencia = tc;
    if (v_res ->> 'numero')::int = 1 and v_n = 2 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '4. TC manual: guarda el MEP como referencia';
  begin
    v_res := public.registrar_asiento(v_p, v_fecha, 'Pago con TC manual', 'pago', v_lineas_pago);
    select count(*) into v_n from public.lineas
    where asiento_id = (v_res ->> 'id')::uuid and tc = 1000 and tc_manual and tc_referencia = public.tc_mep(v_fecha);
    if v_n = 2 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '5. Asiento solo en libro B: registrado';
  begin
    v_res := public.registrar_asiento(v_p, v_fecha, 'Pago libro B', 'pago', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_gasto,    'libro', 'B', 'lado', 'debe',  'importe', '700', 'moneda', 'ARS', 'tc', '1000'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'B', 'lado', 'haber', 'importe', '700', 'moneda', 'ARS', 'tc', '1000')));
    v_id_b := (v_res ->> 'id')::uuid;
    v_ok := v_ok || v_prueba;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '6. Traspaso entre libros: genera 4 líneas con la cuenta puente';
  begin
    v_res := public.registrar_asiento(v_p, v_fecha, 'Traspaso A a B', 'traspaso_libros', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'A', 'lado', 'haber', 'importe', '5000', 'moneda', 'ARS', 'tc', '1000'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'B', 'lado', 'debe',  'importe', '5000', 'moneda', 'ARS', 'tc', '1000')));
    v_id_tr := (v_res ->> 'id')::uuid;
    select count(*) into v_n from public.lineas where asiento_id = v_id_tr;
    select count(*) into v_num from public.lineas where asiento_id = v_id_tr and cuenta_id = v_puente;
    if v_n = 4 and v_num = 2 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — líneas: ' || v_n); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '7. En A+B la cuenta puente suma cero (y en A sola, no)';
  select saldo into v_num  from public.balance_sumas_saldos(v_p, 'AB', 'ARS', null, null) where cuenta_id = v_puente;
  select saldo into v_num2 from public.balance_sumas_saldos(v_p, 'A',  'ARS', null, null) where cuenta_id = v_puente;
  if v_num = 0 and v_num2 = 5000 then v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — A+B: ' || coalesce(v_num::text, 'null') || ', A: ' || coalesce(v_num2::text, 'null')); end if;

  v_prueba := '8. Compra de USD con otro TC: agrega solo la línea de diferencia de cambio';
  begin
    v_res := public.registrar_asiento(v_p, v_fecha, 'Compra de dólares', 'traspaso_cajas', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_caja_usd, 'libro', 'A', 'lado', 'debe',  'importe', '100',    'moneda', 'USD', 'tc', '1205'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'A', 'lado', 'haber', 'importe', '120500', 'moneda', 'ARS', 'tc', '1200')));
    select count(*) into v_n from public.lineas where asiento_id = (v_res ->> 'id')::uuid;
    select count(*) into v_num from public.lineas where asiento_id = (v_res ->> 'id')::uuid and cuenta_id = v_dif;
    if v_n = 3 and v_num = 1 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — líneas: ' || v_n); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '9. Balance A+B: debe = haber en ARS y en USD';
  select sum(debe) - sum(haber) into v_num  from public.balance_sumas_saldos(v_p, 'AB', 'ARS', null, null) where nivel = 1;
  select sum(debe) - sum(haber) into v_num2 from public.balance_sumas_saldos(v_p, 'AB', 'USD', null, null) where nivel = 1;
  if v_num = 0 and v_num2 = 0 then v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — ARS ' || v_num || ', USD ' || v_num2); end if;

  v_prueba := '10. Anulación: contra-asiento con fecha de hoy y original anulado';
  begin
    v_res := public.anular_asiento(v_id, 'Prueba de anulación');
    select count(*) into v_n from public.asientos a
    where a.id = (v_res ->> 'id')::uuid and a.anula_a = v_id and a.fecha = v_hoy;
    select count(*) into v_num from public.asientos a where a.id = v_id and a.estado = 'anulado';
    -- Las líneas del contra-asiento invierten las del original.
    select count(*) into v_num2 from public.lineas o
    join public.lineas c on c.asiento_id = (v_res ->> 'id')::uuid and c.orden = o.orden
    where o.asiento_id = v_id and c.debe = o.haber and c.haber = o.debe and c.cuenta_id = o.cuenta_id;
    if v_n = 1 and v_num = 1 and v_num2 = 2 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || v_prueba; end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '11. Original + anulación suman cero en el mayor';
  select coalesce(sum(debe - haber), 0) into v_num from public.mayor_cuenta(v_p, v_gasto, 'A', 'ARS', null, null)
  where detalle in ('Pago de prueba') or detalle like 'Anulación del asiento 1:%';
  if v_num = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ' || v_num); end if;

  v_prueba := '12. No se anula dos veces ni se anula una anulación';
  begin
    perform public.anular_asiento(v_id, 'Otra vez');
    v_fallas := v_fallas || (v_prueba || ' (anuló dos veces)');
  exception when others then
    begin
      perform public.anular_asiento((v_res ->> 'id')::uuid, 'Anular la anulación');
      v_fallas := v_fallas || (v_prueba || ' (anuló la anulación)');
    exception when others then
      v_ok := v_ok || v_prueba;
    end;
  end;

  v_prueba := '13. Nada se borra ni se modifica directamente';
  begin
    delete from public.lineas where asiento_id = v_id;
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    begin
      insert into public.asientos (proyecto_id, numero, fecha, detalle, tipo) values (v_p, 999, v_fecha, 'x', 'manual');
      v_fallas := v_fallas || (v_prueba || ' (insert directo)');
    exception when insufficient_privilege then
      v_ok := v_ok || v_prueba;
    end;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Como contador SIN libro B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cont, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '14. Sin ve_libro_b no se ven líneas del libro B';
  select count(*) into v_n from public.lineas where proyecto_id = v_p and libro = 'B';
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ve ' || v_n); end if;

  v_prueba := '15. Sin ve_libro_b no se ve el asiento que es solo del libro B';
  select count(*) into v_n from public.asientos where id = v_id_b;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '16. Sin ve_libro_b, los totales A+B son los del libro A';
  select sum(debe) into v_num  from public.balance_sumas_saldos(v_p, 'AB', 'ARS', null, null) where nivel = 1;
  select sum(debe) into v_num2 from public.balance_sumas_saldos(v_p, 'A',  'ARS', null, null) where nivel = 1;
  if v_num = v_num2 then v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — A+B ' || v_num || ' vs A ' || v_num2); end if;

  v_prueba := '17. Sin ve_libro_b no se registra en el libro B';
  begin
    perform public.registrar_asiento(v_p, v_fecha, 'Intento B', 'pago', jsonb_build_array(
      jsonb_build_object('cuenta_id', v_gasto,    'libro', 'B', 'lado', 'debe',  'importe', '1', 'moneda', 'ARS', 'tc', '1000'),
      jsonb_build_object('cuenta_id', v_caja_ars, 'libro', 'B', 'lado', 'haber', 'importe', '1', 'moneda', 'ARS', 'tc', '1000')));
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '18. Contador sin libro B no anula un traspaso que tiene líneas B';
  begin
    perform public.anular_asiento(v_id_tr, 'Intento');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '19. El contador registra en el libro A';
  begin
    perform public.registrar_asiento(v_p, v_fecha, 'Pago del contador', 'pago', v_lineas_pago);
    v_ok := v_ok || v_prueba;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '20. El contador no puede cerrar meses';
  begin
    insert into public.cierres (proyecto_id, mes) values (v_p, date '2001-04-01');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Como administrador SIN libro B: la auditoría no le muestra el libro B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '21. La auditoría no muestra líneas B a quien no ve el libro B';
  select count(*) into v_n from public.auditoria
  where proyecto_id = v_p and tabla = 'lineas' and coalesce(despues, antes) ->> 'libro' = 'B';
  select count(*) into v_num from public.auditoria where proyecto_id = v_p and tabla = 'lineas';
  if v_n = 0 and v_num > 0 then v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — ve ' || v_n); end if;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Como lectura y como comercial
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lect, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '22. Lectura consulta pero no registra';
  select count(*) into v_n from public.lineas where proyecto_id = v_p;
  begin
    perform public.registrar_asiento(v_p, v_fecha, 'Intento lectura', 'pago', v_lineas_pago);
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    if v_n > 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' (no ve nada)'); end if;
  end;

  v_prueba := '23. Lectura no anula';
  begin
    perform public.anular_asiento(v_id_tr, 'Intento lectura');
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '24. Comercial no ve movimientos';
  select count(*) into v_n from public.lineas where proyecto_id = v_p;
  select count(*) into v_num from public.asientos where proyecto_id = v_p;
  if v_n = 0 and v_num = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Mes actual cerrado: tampoco se anula
  -- ---------------------------------------------------------------------------
  insert into public.cierres (proyecto_id, mes) values (v_p, date_trunc('month', v_hoy)::date);
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '25. Con el mes actual cerrado no se puede anular';
  begin
    perform public.anular_asiento(v_id_tr, 'Intento con mes cerrado');
    v_fallas := v_fallas || v_prueba;
  exception when others then
    if sqlerrm like '%cerrado%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- La base rechaza un asiento desbalanceado aunque se escriba directo
  -- ---------------------------------------------------------------------------
  v_prueba := '26. Un insert directo desbalanceado lo rechaza el trigger de partida doble';
  begin
    insert into public.asientos (id, proyecto_id, numero, fecha, detalle, tipo)
    values (gen_random_uuid(), v_p, 998, v_fecha, 'Directo', 'manual') returning id into v_id;
    insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, debe, moneda, importe_origen, tc, importe_ars, importe_usd)
    values (v_id, v_p, 1, v_gasto, 'A', 10, 'ARS', 10, 1000, 10, 0.01);
    insert into public.lineas (asiento_id, proyecto_id, orden, cuenta_id, libro, haber, moneda, importe_origen, tc, importe_ars, importe_usd)
    values (v_id, v_p, 2, v_caja_ars, 'A', 9, 'ARS', 9, 1000, 9, 0.01);
    set constraints public.lineas_partida_doble immediate;
    v_fallas := v_fallas || v_prueba;
  exception
    when check_violation then v_ok := v_ok || v_prueba;
    when others then v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  -- ---------------------------------------------------------------------------
  -- Resultado (el error final deshace todo lo creado arriba)
  -- ---------------------------------------------------------------------------
  if cardinality(v_fallas) = 0 then
    raise exception E'VERIFICACIÓN CONTABLE SUPERADA: % de % pruebas OK.\n%\n(Este mensaje sale como error a propósito: así se deshace todo lo de prueba.)',
      cardinality(v_ok), cardinality(v_ok), array_to_string(v_ok, E'\n');
  else
    raise exception E'VERIFICACIÓN CONTABLE FALLIDA: % prueba(s) con problemas.\nFALLARON:\n%\nOK:\n%',
      cardinality(v_fallas), array_to_string(v_fallas, E'\n'), array_to_string(v_ok, E'\n');
  end if;
end;
$$;
