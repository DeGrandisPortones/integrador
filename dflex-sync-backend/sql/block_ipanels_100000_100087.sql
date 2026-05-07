-- block_ipanels_100000_100087.sql
-- Objetivo:
--   Bloquear partidas iPanel para que nunca queden en public.preproduccion_valores_ipanels.
--   La sincronizacion del integrador tambien tiene esta lista hardcodeada como proteccion,
--   pero esta tabla permite auditar y extender el bloqueo sin tocar codigo.

begin;

create table if not exists public.ipanel_sync_blocklist (
  partida integer primary key,
  motivo text null,
  created_at timestamp with time zone not null default now()
);

insert into public.ipanel_sync_blocklist (partida, motivo) values
  (100000, 'Bloqueado por lote legacy'),
  (100001, 'Bloqueado por lote legacy'),
  (100002, 'Bloqueado por lote legacy'),
  (100003, 'Bloqueado por lote legacy'),
  (100004, 'Bloqueado por lote legacy'),
  (100005, 'Bloqueado por lote legacy'),
  (100006, 'Bloqueado por lote legacy'),
  (100007, 'Bloqueado por lote legacy'),
  (100008, 'Bloqueado por lote legacy'),
  (100009, 'Bloqueado por lote legacy'),
  (100010, 'Bloqueado por lote legacy'),
  (100011, 'Bloqueado por lote legacy'),
  (100012, 'Bloqueado por lote legacy'),
  (100013, 'Bloqueado por lote legacy'),
  (100014, 'Bloqueado por lote legacy'),
  (100015, 'Bloqueado por lote legacy'),
  (100016, 'Bloqueado por lote legacy'),
  (100017, 'Bloqueado por lote legacy'),
  (100018, 'Bloqueado por lote legacy'),
  (100019, 'Bloqueado por lote legacy'),
  (100020, 'Bloqueado por lote legacy'),
  (100021, 'Bloqueado por lote legacy'),
  (100022, 'Bloqueado por lote legacy'),
  (100023, 'Bloqueado por lote legacy'),
  (100024, 'Bloqueado por lote legacy'),
  (100025, 'Bloqueado por lote legacy'),
  (100026, 'Bloqueado por lote legacy'),
  (100027, 'Bloqueado por lote legacy'),
  (100028, 'Bloqueado por lote legacy'),
  (100034, 'Bloqueado por lote legacy'),
  (100037, 'Bloqueado por lote legacy'),
  (100038, 'Bloqueado por lote legacy'),
  (100039, 'Bloqueado por lote legacy'),
  (100041, 'Bloqueado por lote legacy'),
  (100042, 'Bloqueado por lote legacy'),
  (100043, 'Bloqueado por lote legacy'),
  (100044, 'Bloqueado por lote legacy'),
  (100046, 'Bloqueado por lote legacy'),
  (100047, 'Bloqueado por lote legacy'),
  (100048, 'Bloqueado por lote legacy'),
  (100045, 'Bloqueado por lote legacy'),
  (100049, 'Bloqueado por lote legacy'),
  (100050, 'Bloqueado por lote legacy'),
  (100051, 'Bloqueado por lote legacy'),
  (100052, 'Bloqueado por lote legacy'),
  (100053, 'Bloqueado por lote legacy'),
  (100054, 'Bloqueado por lote legacy'),
  (100055, 'Bloqueado por lote legacy'),
  (100056, 'Bloqueado por lote legacy'),
  (100057, 'Bloqueado por lote legacy'),
  (100058, 'Bloqueado por lote legacy'),
  (100059, 'Bloqueado por lote legacy'),
  (100060, 'Bloqueado por lote legacy'),
  (100061, 'Bloqueado por lote legacy'),
  (100062, 'Bloqueado por lote legacy'),
  (100063, 'Bloqueado por lote legacy'),
  (100064, 'Bloqueado por lote legacy'),
  (100065, 'Bloqueado por lote legacy'),
  (100067, 'Bloqueado por lote legacy'),
  (100066, 'Bloqueado por lote legacy'),
  (100069, 'Bloqueado por lote legacy'),
  (100068, 'Bloqueado por lote legacy'),
  (100070, 'Bloqueado por lote legacy'),
  (100071, 'Bloqueado por lote legacy'),
  (100072, 'Bloqueado por lote legacy'),
  (100073, 'Bloqueado por lote legacy'),
  (100074, 'Bloqueado por lote legacy'),
  (100075, 'Bloqueado por lote legacy'),
  (100076, 'Bloqueado por lote legacy'),
  (100077, 'Bloqueado por lote legacy'),
  (100078, 'Bloqueado por lote legacy'),
  (100079, 'Bloqueado por lote legacy'),
  (100080, 'Bloqueado por lote legacy'),
  (100081, 'Bloqueado por lote legacy'),
  (100082, 'Bloqueado por lote legacy'),
  (100085, 'Bloqueado por lote legacy'),
  (100087, 'Bloqueado por lote legacy')
on conflict (partida) do update
  set motivo = excluded.motivo;

-- Limpieza inmediata: si alguno ya estaba sincronizado, lo elimina del listado de preproduccion.
delete from public.preproduccion_valores_ipanels p
using public.ipanel_sync_blocklist b
where b.partida = p.partida;

commit;
