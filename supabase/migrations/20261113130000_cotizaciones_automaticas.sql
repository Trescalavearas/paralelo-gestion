-- =============================================================================
-- Fase 2 · Carga automática diaria del dólar MEP y blue
--
-- Corre dentro de Supabase con pg_cron (agenda) y pg_net (pedidos HTTP).
-- No hace falta ninguna clave: las fuentes son públicas.
--   · Día:       https://dolarapi.com/v1/dolares/{bolsa|blue}
--   · Histórico: https://api.argentinadatos.com/v1/cotizaciones/dolares/{bolsa|blue}
--
-- pg_net es asíncrono: una función pide los datos y otra, minutos después,
-- procesa las respuestas. Una carga manual (desde la pantalla "Tipo de cambio")
-- nunca se pisa con la automática.
--
-- Requiere la migración 20261113120000_contabilidad.sql.
-- =============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;


-- Pedidos HTTP pendientes de procesar.
create table public.cotizaciones_solicitudes (
  request_id   bigint primary key,
  tipo         public.tipo_cotizacion not null,
  fuente       text not null,
  url          text not null,
  creado_en    timestamptz not null default now(),
  procesada_en timestamptz,
  resultado    text
);
comment on table public.cotizaciones_solicitudes is 'Bitácora técnica de la carga automática de cotizaciones.';

alter table public.cotizaciones_solicitudes enable row level security;  -- sin políticas: nadie la lee desde la app
revoke all on public.cotizaciones_solicitudes from anon, authenticated;


-- Pide las cotizaciones. p_historico = true trae toda la serie histórica.
create function public.cotizaciones_solicitar(p_historico boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fuente record;
  v_id     bigint;
  v_n      integer := 0;
begin
  for v_fuente in
    select * from (values
      ('mep'::public.tipo_cotizacion,  'bolsa'),
      ('blue'::public.tipo_cotizacion, 'blue')
    ) as f(tipo, casa)
  loop
    if p_historico then
      v_id := net.http_get(
        url := 'https://api.argentinadatos.com/v1/cotizaciones/dolares/' || v_fuente.casa,
        timeout_milliseconds := 30000
      );
      insert into public.cotizaciones_solicitudes (request_id, tipo, fuente, url)
      values (v_id, v_fuente.tipo, 'argentinadatos.com',
              'https://api.argentinadatos.com/v1/cotizaciones/dolares/' || v_fuente.casa);
    else
      v_id := net.http_get(
        url := 'https://dolarapi.com/v1/dolares/' || v_fuente.casa,
        timeout_milliseconds := 15000
      );
      insert into public.cotizaciones_solicitudes (request_id, tipo, fuente, url)
      values (v_id, v_fuente.tipo, 'dolarapi.com', 'https://dolarapi.com/v1/dolares/' || v_fuente.casa);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;


-- Procesa las respuestas que ya llegaron. Devuelve cuántas cotizaciones cargó.
create function public.cotizaciones_procesar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol       record;
  v_resp      record;
  v_datos     jsonb;
  v_cargadas  integer;
  v_total     integer := 0;
begin
  for v_sol in
    select * from public.cotizaciones_solicitudes s
    where s.procesada_en is null
    order by s.creado_en
  loop
    select r.status_code, r.content, r.timed_out, r.error_msg into v_resp
    from net._http_response r where r.id = v_sol.request_id;

    if not found then
      if v_sol.creado_en < now() - interval '2 hours' then
        update public.cotizaciones_solicitudes
        set procesada_en = now(), resultado = 'sin respuesta'
        where request_id = v_sol.request_id;
      end if;
      continue;
    end if;

    if v_resp.status_code is distinct from 200 then
      update public.cotizaciones_solicitudes
      set procesada_en = now(),
          resultado = 'error: ' || coalesce(v_resp.status_code::text, v_resp.error_msg, 'desconocido')
      where request_id = v_sol.request_id;
      continue;
    end if;

    begin
      v_datos := v_resp.content::jsonb;
      if jsonb_typeof(v_datos) = 'object' then
        v_datos := jsonb_build_array(v_datos);
      end if;

      -- dolarapi trae "fechaActualizacion" (con hora); argentinadatos trae "fecha".
      with filas as (
        select distinct on (fecha)
               coalesce(
                 (e ->> 'fecha')::date,
                 ((e ->> 'fechaActualizacion')::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date
               ) as fecha,
               (e ->> 'compra')::numeric as compra,
               (e ->> 'venta')::numeric  as venta
        from jsonb_array_elements(v_datos) e
        where (e ->> 'compra')::numeric > 0 and (e ->> 'venta')::numeric > 0
        order by fecha
      ), cargadas as (
        insert into public.cotizaciones (fecha, tipo, compra, venta, fuente)
        select f.fecha, v_sol.tipo, f.compra, f.venta, v_sol.fuente
        from filas f
        where f.fecha is not null
        on conflict (fecha, tipo) do update
          set compra = excluded.compra, venta = excluded.venta, fuente = excluded.fuente
          -- solo pisa cargas automáticas, y solo si cambió el valor
          where public.cotizaciones.cargada_por is null
            and (public.cotizaciones.compra, public.cotizaciones.venta)
                is distinct from (excluded.compra, excluded.venta)
        returning 1
      )
      select count(*) into v_cargadas from cargadas;

      update public.cotizaciones_solicitudes
      set procesada_en = now(), resultado = 'ok: ' || v_cargadas || ' cotización(es)'
      where request_id = v_sol.request_id;
      v_total := v_total + v_cargadas;
    exception when others then
      update public.cotizaciones_solicitudes
      set procesada_en = now(), resultado = 'error al leer: ' || sqlerrm
      where request_id = v_sol.request_id;
    end;
  end loop;

  -- Limpieza de la bitácora.
  delete from public.cotizaciones_solicitudes where creado_en < now() - interval '30 days';
  return v_total;
end;
$$;

revoke all on function public.cotizaciones_solicitar(boolean), public.cotizaciones_procesar()
from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Agenda (pg_cron usa UTC). Argentina = UTC-3.
--   · 18:15 y 20:45 de lunes a viernes: pide el MEP y el blue del día.
--   · Cada 10 minutos: procesa las respuestas pendientes (si no hay, no hace nada).
-- -----------------------------------------------------------------------------

select cron.schedule('cotizaciones-pedir-tarde', '15 21 * * 1-5', $$select public.cotizaciones_solicitar()$$);
select cron.schedule('cotizaciones-pedir-noche', '45 23 * * 1-5', $$select public.cotizaciones_solicitar()$$);
select cron.schedule('cotizaciones-procesar', '*/10 * * * *', $$select public.cotizaciones_procesar()$$);

-- Carga inicial: la serie histórica y el valor de hoy. Se procesan solos en
-- los próximos 10 minutos.
select public.cotizaciones_solicitar(true);
select public.cotizaciones_solicitar(false);
