-- Ejecutar en Supabase antes de sincronizar iPanels desde el integrador.
-- Agrega la descripcion del producto para logística (/i) y workflow.

alter table public.preproduccion_valores_ipanels
  add column if not exists descripcion text;

alter table public.ipanel
  add column if not exists descripcion text;

update public.preproduccion_valores_ipanels
set descripcion = coalesce(
  nullif(descripcion, ''),
  nullif(data->>'descripcion', ''),
  nullif(data->>'producto_descripcion', ''),
  nullif(data->>'producto_descripciones', ''),
  nullif(data->>'descripcion_producto', '')
)
where coalesce(descripcion, '') = ''
  and data is not null;

update public.preproduccion_valores_ipanels
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{descripcion}',
  to_jsonb(descripcion)
)
where coalesce(descripcion, '') <> ''
  and coalesce(data->>'descripcion', '') = '';

update public.ipanel i
set descripcion = coalesce(
  nullif(i.descripcion, ''),
  nullif(p.descripcion, ''),
  nullif(p.data->>'descripcion', ''),
  nullif(p.data->>'producto_descripcion', ''),
  nullif(p.data->>'producto_descripciones', ''),
  nullif(p.data->>'descripcion_producto', '')
)
from public.preproduccion_valores_ipanels p
where p.partida = i.partida
  and coalesce(i.descripcion, '') = '';

create index if not exists preproduccion_valores_ipanels_descripcion_idx
  on public.preproduccion_valores_ipanels using btree (descripcion);

create index if not exists ipanel_descripcion_idx
  on public.ipanel using btree (descripcion);
