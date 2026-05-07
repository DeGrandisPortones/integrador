-- block_ipanels_100000_100736_except_allowed.sql
-- Objetivo:
--   Bloquear todos los iPanels con partida entre 100000 y 100736 inclusive,
--   EXCEPTO las partidas permitidas en allowed_list.
--
-- Resultado:
--   - Las partidas bloqueadas no entran a public.preproduccion_valores_ipanels.
--   - Si alguna partida bloqueada ya existe en preproduccion_valores_ipanels, se elimina.
--   - Las partidas exceptuadas quedan habilitadas.
--   - Las partidas mayores a 100736 no se bloquean por esta regla.

begin;

create table if not exists public.ipanel_sync_blocklist (
  partida integer primary key,
  motivo text null,
  created_at timestamp with time zone not null default now()
);

with allowed_list(partida) as (
  values
    (100083),(100084),(100300),(100398),(100512),(100513),(100514),(100523),
    (100359),(100369),(100650),(100658),(100677),(100678),(100679),(100682),
    (100710),(100713),(100715),(100716),(100717),(100718),(100721),(100736)
),
blocked_range(partida) as (
  select generate_series(100000, 100736)::integer
),
blocked_final(partida) as (
  select br.partida
  from blocked_range br
  left join allowed_list al on al.partida = br.partida
  where al.partida is null
)
-- Primero limpiamos cualquier regla anterior dentro del rango para que las excepciones queden habilitadas.
delete from public.ipanel_sync_blocklist b
where b.partida between 100000 and 100736;

with allowed_list(partida) as (
  values
    (100083),(100084),(100300),(100398),(100512),(100513),(100514),(100523),
    (100359),(100369),(100650),(100658),(100677),(100678),(100679),(100682),
    (100710),(100713),(100715),(100716),(100717),(100718),(100721),(100736)
),
blocked_range(partida) as (
  select generate_series(100000, 100736)::integer
),
blocked_final(partida) as (
  select br.partida
  from blocked_range br
  left join allowed_list al on al.partida = br.partida
  where al.partida is null
)
insert into public.ipanel_sync_blocklist (partida, motivo)
select partida, 'Bloqueado por rango 100000-100736 excepto permitidos'
from blocked_final
on conflict (partida) do update
  set motivo = excluded.motivo;

-- Limpieza inmediata: si una partida bloqueada ya estaba sincronizada, se elimina del listado de preproduccion.
with blocked_final as (
  select partida
  from public.ipanel_sync_blocklist
  where partida between 100000 and 100736
)
delete from public.preproduccion_valores_ipanels p
using blocked_final b
where b.partida = p.partida;

-- Reporte de control.
with allowed_list(partida) as (
  values
    (100083),(100084),(100300),(100398),(100512),(100513),(100514),(100523),
    (100359),(100369),(100650),(100658),(100677),(100678),(100679),(100682),
    (100710),(100713),(100715),(100716),(100717),(100718),(100721),(100736)
)
select
  (select count(*) from public.ipanel_sync_blocklist where partida between 100000 and 100736) as bloqueados_en_rango,
  (select count(*) from allowed_list) as permitidos_en_rango,
  (select count(*) from public.preproduccion_valores_ipanels p join public.ipanel_sync_blocklist b on b.partida = p.partida) as bloqueados_que_quedaron_en_preproduccion;

commit;
