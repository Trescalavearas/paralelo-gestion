-- =============================================================================
-- Verificación de la importación (fase 3)
--
-- Cómo usarlo: pegá todo este archivo en el SQL Editor de Supabase y tocá Run.
-- Requiere las migraciones de las fases 1, 2 y 3.
--
-- Usa SOLO datos inventados: un proyecto de prueba, cuentas y movimientos
-- ficticios con fechas de 2001.
--
-- Igual que los otros scripts, SIEMPRE termina con un mensaje en rojo: es a
-- propósito, así se deshace todo y no queda rastro.
--   · "VERIFICACIÓN DE IMPORTACIÓN SUPERADA" → todo bien.
--   · "VERIFICACIÓN DE IMPORTACIÓN FALLIDA"  → el mensaje lista qué falló.
-- =============================================================================

do $$
declare
  v_adm     uuid := gen_random_uuid();  -- administrador con libro B
  v_adm2    uuid := gen_random_uuid();  -- administrador sin libro B
  v_cont    uuid := gen_random_uuid();  -- contador
  v_p       uuid;
  v_plan    jsonb;
  v_res     jsonb;
  v_lote    uuid;
  v_lote2   uuid;
  v_banco   uuid;  -- cuenta en USD
  v_caja    uuid;
  v_prov    uuid;
  v_cuotas  uuid;
  v_n       bigint;
  v_num     numeric;
  v_num2    numeric;
  v_txt     text;
  v_filas   jsonb;
  v_ok      text[] := '{}';
  v_fallas  text[] := '{}';
  v_prueba  text;
begin
  -- ---------------------------------------------------------------------------
  -- Preparación
  -- ---------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
         'prueba-importacion-' || u || '@ejemplo.invalid', '{}', '{}', now(), now()
  from unnest(array[v_adm, v_adm2, v_cont]) as u;

  insert into public.proyectos (nombre, figura) values ('Prueba de importación', 'fideicomiso') returning id into v_p;
  insert into public.miembros (proyecto_id, usuario_id, rol, ve_libro_b) values
    (v_p, v_adm, 'administrador', true),
    (v_p, v_adm2, 'administrador', false),
    (v_p, v_cont, 'contador', true);

  v_plan := '[
    {"n1": "1. ACTIVO",                "n2": "DISPONIBILIDADES", "n3": "BANCOS",   "n4": "BANCO INVENTADO USD", "computa": true},
    {"n1": "1. ACTIVO",                "n2": "DISPONIBILIDADES", "n3": "CAJAS",    "n4": "Caja  inventada",     "computa": true},
    {"n1": "2. PASIVO",                "n2": "DEUDAS",           "n3": "VARIAS",   "n4": "DEUDA INVENTADA",     "computa": true},
    {"n1": "B - COSTO CONSTRUCCIÓN",   "n2": "ESTRUCTURA",       "n3": "HORMIGÓN", "n4": "PROVEEDOR FICTICIO",  "computa": true},
    {"n1": "I - INGRESOS",             "n2": "VENTAS",           "n3": "CUOTAS",   "n4": "CUOTAS FICTICIAS",    "computa": false}
  ]'::jsonb;

  -- ---------------------------------------------------------------------------
  -- Como administrador con libro B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '1. Plan: arma el árbol con códigos, tipos, rubro de obra y COMPUTA';
  begin
    v_res := public.importar_plan_cuentas(v_p, v_plan);
    select id into v_banco  from public.cuentas where proyecto_id = v_p and nombre = 'BANCO INVENTADO USD';
    select id into v_caja   from public.cuentas where proyecto_id = v_p and nombre = 'Caja inventada';
    select id into v_prov   from public.cuentas where proyecto_id = v_p and nombre = 'PROVEEDOR FICTICIO';
    select id into v_cuotas from public.cuentas where proyecto_id = v_p and nombre = 'CUOTAS FICTICIAS';
    if (select codigo from public.cuentas where id = v_banco) = '1.01.01.01'
       and (select codigo from public.cuentas where id = v_caja) = '1.01.02.01'
       and (select codigo from public.cuentas where id = v_prov) = 'B.01.01.01'
       and (select tipo::text from public.cuentas where id = v_prov) = 'egreso'
       and (select rubro_obra from public.cuentas where id = v_prov) = 'ESTRUCTURA'
       and (select tipo::text from public.cuentas where id = v_cuotas) = 'ingreso'
       and (select not computa from public.cuentas where id = v_cuotas)
       and (select tipo::text from public.cuentas where proyecto_id = v_p and nombre = 'DEUDA INVENTADA') = 'pasivo'
    then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '2. Plan: crea la cuenta puente y la de diferencia de cambio en su lugar';
  select count(*) into v_n from public.cuentas c
  where c.proyecto_id = v_p and c.nivel = 4
    and ((c.es_puente and c.nombre = 'TRASPASOS ENTRE LIBROS' and c.tipo = 'patrimonio_neto')
      or (c.es_diferencia_cambio and c.nombre = 'DIFERENCIA DE CAMBIO' and c.tipo = 'ingreso'));
  if v_n = 2 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ' || v_n); end if;

  v_prueba := '3. Plan: reimportar no duplica (sin distinguir mayúsculas ni espacios)';
  begin
    select count(*) into v_n from public.cuentas where proyecto_id = v_p;
    v_res := public.importar_plan_cuentas(v_p,
      replace(replace(v_plan::text, 'Caja  inventada', 'CAJA INVENTADA'), 'DEUDA INVENTADA', '  deuda   inventada ')::jsonb);
    select count(*) into v_num from public.cuentas where proyecto_id = v_p;
    if v_n = v_num and (v_res ->> 'creadas')::int = 0 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  -- Movimientos inventados: 4 filas (3 en BB = A, 1 en KK = B).
  -- La fila 102 mueve una cuenta en USD; la 103 tiene un USD que NO sale del TC
  -- (se tiene que guardar tal cual).
  v_filas := jsonb_build_array(
    jsonb_build_object('id', '101', 'origen', 'CONCILIADO', 'fecha', '2001-05-03', 'detalle', 'Pago inventado',
      'libro', 'A', 'cuenta_id', v_prov, 'contracuenta_id', v_caja, 'neto', '150000.00', 'usd', '150.00',
      'tc', '1000', 'tc_manual', false, 'moneda_cuenta', 'ARS', 'moneda_contracuenta', 'ARS'),
    jsonb_build_object('id', '102', 'origen', '', 'fecha', '2001-05-10', 'detalle', 'Cobro inventado en dólares',
      'libro', 'A', 'cuenta_id', v_cuotas, 'contracuenta_id', v_banco, 'neto', '-200000.00', 'usd', '-200.00',
      'tc', '1000', 'tc_manual', true, 'moneda_cuenta', 'ARS', 'moneda_contracuenta', 'USD'),
    jsonb_build_object('id', '103', 'origen', 'PENDIENTE', 'fecha', '2001-05-20', 'detalle', 'Ajuste inventado',
      'libro', 'A', 'cuenta_id', v_prov, 'contracuenta_id', v_caja, 'neto', '1234.56', 'usd', '7.89',
      'tc', '1000', 'tc_manual', false, 'moneda_cuenta', 'ARS', 'moneda_contracuenta', 'ARS'),
    jsonb_build_object('id', '104', 'origen', '', 'fecha', '2001-05-25', 'detalle', 'Pago inventado libro B',
      'libro', 'B', 'cuenta_id', v_prov, 'contracuenta_id', v_caja, 'neto', '50000.00', 'usd', '50.00',
      'tc', '1000', 'tc_manual', false, 'moneda_cuenta', 'ARS', 'moneda_contracuenta', 'ARS'));

  v_prueba := '4. Importar: 4 filas, 8 líneas, tipo importado con origen e ID';
  begin
    v_lote := public.iniciar_importacion(v_p, 'planilla-inventada.xlsx', '{"sin_cuenta": 2}');
    v_res := public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote, 'filas', v_filas));
    select count(*) into v_n from public.asientos where lote_id = v_lote and tipo::text = 'importado';
    select count(*) into v_num from public.lineas li join public.asientos a on a.id = li.asiento_id where a.lote_id = v_lote;
    select origen into v_txt from public.asientos where proyecto_id = v_p and origen_id = '101';
    if (v_res ->> 'importadas')::int = 4 and v_n = 4 and v_num = 8 and v_txt = 'CONCILIADO' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '5. NETO > 0: debe en CUENTA; NETO < 0: debe en CONTRACUENTA';
  select count(*) into v_n from public.lineas li join public.asientos a on a.id = li.asiento_id
  where a.proyecto_id = v_p and (
       (a.origen_id = '101' and li.debe > 0 and li.cuenta_id = v_prov)
    or (a.origen_id = '102' and li.debe > 0 and li.cuenta_id = v_banco)
    or (a.origen_id = '102' and li.haber > 0 and li.cuenta_id = v_cuotas));
  if v_n = 3 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ' || v_n); end if;

  v_prueba := '6. Cuenta USD: línea en dólares con importe de origen = |USD|';
  select count(*) into v_n from public.lineas li join public.asientos a on a.id = li.asiento_id
  where a.origen_id = '102' and a.proyecto_id = v_p and li.cuenta_id = v_banco
    and li.moneda = 'USD' and li.importe_origen = 200 and li.importe_ars = 200000 and li.tc_manual;
  if v_n = 1 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '7. Los importes se guardan tal cual (USD 7,89 aunque el TC diga otra cosa)';
  select count(*) into v_n from public.lineas li join public.asientos a on a.id = li.asiento_id
  where a.origen_id = '103' and a.proyecto_id = v_p and li.importe_ars = 1234.56 and li.importe_usd = 7.89;
  if v_n = 2 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  v_prueba := '8. Totales ARS y USD iguales a los de origen, por libro';
  begin
    v_res := public.finalizar_importacion(v_lote);
  exception when others then
    v_res := jsonb_build_object('error', sqlerrm);
  end;
  if (v_res -> 'total_ars' ->> 'A')::numeric = 150000 + 200000 + 1234.56
     and (v_res -> 'total_usd' ->> 'A')::numeric = 150 + 200 + 7.89
     and (v_res -> 'total_ars' ->> 'B')::numeric = 50000
     and (v_res -> 'total_usd' ->> 'B')::numeric = 50
     and v_res ->> 'estado' = 'completo' then
    v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — ' || (v_res -> 'total_ars')::text || ' ' || (v_res -> 'total_usd')::text); end if;

  v_prueba := '9. Balance A+B: debe = haber en ARS y en USD (partida doble)';
  select sum(debe) - sum(haber) into v_num  from public.balance_sumas_saldos(v_p, 'AB', 'ARS', null, null) where nivel = 1;
  select sum(debe) - sum(haber) into v_num2 from public.balance_sumas_saldos(v_p, 'AB', 'USD', null, null) where nivel = 1;
  if v_num = 0 and v_num2 = 0 then v_ok := v_ok || v_prueba;
  else v_fallas := v_fallas || (v_prueba || ' — ARS ' || v_num || ', USD ' || v_num2); end if;

  v_prueba := '10. Reimportar el mismo Excel no duplica (solo agrega filas nuevas)';
  begin
    v_lote2 := public.iniciar_importacion(v_p, 'planilla-inventada.xlsx', '{}');
    v_res := public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas',
      v_filas || jsonb_build_array(jsonb_build_object('id', '105', 'fecha', '2001-06-02', 'detalle', 'Fila nueva inventada',
        'libro', 'A', 'cuenta_id', v_prov, 'contracuenta_id', v_caja, 'neto', '10.00', 'usd', '0.01', 'tc', '1000'))));
    select count(*) into v_n from public.asientos where proyecto_id = v_p and tipo::text = 'importado';
    if (v_res ->> 'importadas')::int = 1 and (v_res ->> 'existentes')::int = 4 and v_n = 5 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
    perform public.finalizar_importacion(v_lote2);
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '11. Una cuenta inexistente rechaza toda la tanda';
  select count(*) into v_n from public.asientos where proyecto_id = v_p;
  begin
    perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
      jsonb_build_object('id', '201', 'fecha', '2001-06-03', 'libro', 'A', 'cuenta_id', v_prov,
        'contracuenta_id', v_caja, 'neto', '5', 'usd', '0.01', 'tc', '1000'),
      jsonb_build_object('id', '202', 'fecha', '2001-06-03', 'libro', 'A', 'cuenta_id', gen_random_uuid(),
        'contracuenta_id', v_caja, 'neto', '5', 'usd', '0.01', 'tc', '1000'))));
    v_fallas := v_fallas || v_prueba;
  exception when others then
    select count(*) into v_num from public.asientos where proyecto_id = v_p;
    if v_num = v_n and sqlerrm like '%no existe en el plan%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  v_prueba := '12. Validaciones: USD = 0 con NETO ≠ 0, fecha inválida y libro vacío';
  begin
    perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
      jsonb_build_object('id', '301', 'fecha', '2001-06-03', 'libro', 'A', 'cuenta_id', v_prov,
        'contracuenta_id', v_caja, 'neto', '5', 'usd', '0', 'tc', '1000'))));
    v_fallas := v_fallas || (v_prueba || ' (USD = 0)');
  exception when others then
    begin
      perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
        jsonb_build_object('id', '302', 'fecha', '2001-13-45', 'libro', 'A', 'cuenta_id', v_prov,
          'contracuenta_id', v_caja, 'neto', '5', 'usd', '1', 'tc', '1000'))));
      v_fallas := v_fallas || (v_prueba || ' (fecha)');
    exception when others then
      begin
        perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
          jsonb_build_object('id', '303', 'fecha', '2001-06-03', 'libro', '', 'cuenta_id', v_prov,
            'contracuenta_id', v_caja, 'neto', '5', 'usd', '1', 'tc', '1000'))));
        v_fallas := v_fallas || (v_prueba || ' (libro)');
      exception when others then
        v_ok := v_ok || v_prueba;
      end;
    end;
  end;

  v_prueba := '13. Un asiento importado no se borra fuera de "deshacer lote"';
  reset role;
  begin
    delete from public.asientos where proyecto_id = v_p and origen_id = '105';
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  -- Mes cerrado: mayo de 2001.
  insert into public.cierres (proyecto_id, mes) values (v_p, date '2001-05-01');
  set local role authenticated;

  v_prueba := '14. Mes cerrado: bloquea importar';
  begin
    perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
      jsonb_build_object('id', '401', 'fecha', '2001-05-15', 'libro', 'A', 'cuenta_id', v_prov,
        'contracuenta_id', v_caja, 'neto', '5', 'usd', '0.01', 'tc', '1000'))));
    v_fallas := v_fallas || v_prueba;
  exception when others then
    if sqlerrm like '%cerrado%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  v_prueba := '15. Mes cerrado: bloquea deshacer el lote';
  begin
    perform public.deshacer_lote(v_lote);
    v_fallas := v_fallas || v_prueba;
  exception when others then
    if sqlerrm like '%mes cerrado%' then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  reset role;
  delete from public.cierres where proyecto_id = v_p;

  -- ---------------------------------------------------------------------------
  -- Como contador y como administrador sin libro B
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_cont, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '16. Un no administrador no puede importar ni deshacer';
  begin
    perform public.importar_plan_cuentas(v_p, v_plan);
    v_fallas := v_fallas || (v_prueba || ' (plan)');
  exception when insufficient_privilege then
    begin
      perform public.iniciar_importacion(v_p, 'x.xlsx', '{}');
      v_fallas := v_fallas || (v_prueba || ' (iniciar)');
    exception when insufficient_privilege then
      begin
        perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', '[]'::jsonb));
        v_fallas := v_fallas || (v_prueba || ' (importar)');
      exception when insufficient_privilege then
        begin
          perform public.deshacer_lote(v_lote);
          v_fallas := v_fallas || (v_prueba || ' (deshacer)');
        exception when insufficient_privilege then
          v_ok := v_ok || v_prueba;
        end;
      end;
    end;
  end;

  v_prueba := '17. El contador no ve los lotes de importación';
  select count(*) into v_n from public.lotes_importacion where proyecto_id = v_p;
  if v_n = 0 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || v_prueba; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '18. Sin libro B no se importan filas KK';
  begin
    perform public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote2, 'filas', jsonb_build_array(
      jsonb_build_object('id', '501', 'fecha', '2001-06-05', 'libro', 'B', 'cuenta_id', v_prov,
        'contracuenta_id', v_caja, 'neto', '5', 'usd', '0.01', 'tc', '1000'))));
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  v_prueba := '19. Sin libro B no se deshace un lote con asientos KK';
  begin
    perform public.deshacer_lote(v_lote);
    v_fallas := v_fallas || v_prueba;
  exception when insufficient_privilege then
    v_ok := v_ok || v_prueba;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Deshacer lote (administrador con libro B)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_prueba := '20. Deshacer lote: borra sus asientos, lo marca deshecho y queda en la auditoría';
  begin
    v_res := public.deshacer_lote(v_lote);
    select count(*) into v_n from public.asientos where lote_id = v_lote;
    select count(*) into v_num from public.auditoria
    where proyecto_id = v_p and tabla = 'asientos' and accion = 'baja';
    select estado into v_txt from public.lotes_importacion where id = v_lote;
    if (v_res ->> 'asientos_borrados')::int = 4 and v_n = 0 and v_num = 4 and v_txt = 'deshecho' then
      v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text || ' auditoría ' || v_num); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  v_prueba := '21. Deshacer no toca otros lotes';
  select count(*) into v_n from public.asientos where lote_id = v_lote2;
  if v_n = 1 then v_ok := v_ok || v_prueba; else v_fallas := v_fallas || (v_prueba || ' — ' || v_n); end if;

  v_prueba := '22. Después de deshacer se puede volver a importar las mismas filas';
  begin
    v_lote := public.iniciar_importacion(v_p, 'planilla-inventada.xlsx', '{}');
    v_res := public.importar_movimientos(v_p, jsonb_build_object('lote_id', v_lote, 'filas', v_filas));
    if (v_res ->> 'importadas')::int = 4 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || v_res::text); end if;
  exception when others then
    v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm);
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Cuenta puente creada a mano en otro lugar (por ejemplo, en la fase 2)
  -- ---------------------------------------------------------------------------
  insert into public.proyectos (nombre, figura) values ('Prueba de importación 2', 'propio') returning id into v_lote2;
  insert into public.miembros (proyecto_id, usuario_id, rol, ve_libro_b) values (v_lote2, v_adm, 'administrador', true);
  insert into public.cuentas (proyecto_id, codigo, nombre, nivel, tipo, es_puente)
  values (v_lote2, '9', 'Traspasos entre libros', 1, 'activo', true);
  set local role authenticated;

  v_prueba := '23. Si ya hay una cuenta puente en otro lugar, el plan avisa y no crea nada';
  begin
    perform public.importar_plan_cuentas(v_lote2, v_plan);
    v_fallas := v_fallas || v_prueba;
  exception when others then
    reset role;
    select count(*) into v_n from public.cuentas where proyecto_id = v_lote2;
    if sqlerrm like 'Ya hay una cuenta puente en otro lugar%' and v_n = 1 then v_ok := v_ok || v_prueba;
    else v_fallas := v_fallas || (v_prueba || ' — ' || sqlerrm); end if;
  end;

  reset role;

  -- ---------------------------------------------------------------------------
  -- Resultado (el error final deshace todo)
  -- ---------------------------------------------------------------------------
  if cardinality(v_fallas) = 0 then
    raise exception E'VERIFICACIÓN DE IMPORTACIÓN SUPERADA: % de % pruebas OK.\n%\n(Este mensaje sale como error a propósito: así se deshace todo lo de prueba.)',
      cardinality(v_ok), cardinality(v_ok), array_to_string(v_ok, E'\n');
  else
    raise exception E'VERIFICACIÓN DE IMPORTACIÓN FALLIDA: % prueba(s) con problemas.\nFALLARON:\n%\nOK:\n%',
      cardinality(v_fallas), array_to_string(v_fallas, E'\n'), array_to_string(v_ok, E'\n');
  end if;
end;
$$;
