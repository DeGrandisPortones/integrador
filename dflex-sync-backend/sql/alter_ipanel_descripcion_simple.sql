-- Ejecutar en Supabase para habilitar DescripcionSimple en iPanels.

create table if not exists public.ipanel_descripcion_simple_mappings (
  descripcion text primary key,
  descripcion_simple text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.preproduccion_valores_ipanels
  add column if not exists descripcion text;

alter table public.preproduccion_valores_ipanels
  add column if not exists descripcion_simple text;

alter table public.ipanel
  add column if not exists descripcion text;

alter table public.ipanel
  add column if not exists descripcion_simple text;

create index if not exists ipanel_descripcion_simple_mappings_value_idx
  on public.ipanel_descripcion_simple_mappings using btree (descripcion_simple);

create index if not exists preproduccion_valores_ipanels_descripcion_simple_idx
  on public.preproduccion_valores_ipanels using btree (descripcion_simple);

create index if not exists ipanel_descripcion_simple_idx
  on public.ipanel using btree (descripcion_simple);

-- Backfill de descripcion, si ya se sincronizó antes.
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

-- Backfill automático simple para lo ya sincronizado.
update public.preproduccion_valores_ipanels
set descripcion_simple = case
  when upper(coalesce(descripcion, data->>'descripcion', data->>'producto_descripcion', data->>'producto_descripciones', data->>'descripcion_producto', '')) like '%MADERA%' then 'MADERA'
  when upper(coalesce(descripcion, data->>'descripcion', data->>'producto_descripcion', data->>'producto_descripciones', data->>'descripcion_producto', '')) like '%ALUMINIO%' then 'ALUMINIO'
  else descripcion_simple
end
where coalesce(descripcion_simple, '') = '';

update public.preproduccion_valores_ipanels
set data = jsonb_set(
  jsonb_set(coalesce(data, '{}'::jsonb), '{DescripcionSimple}', to_jsonb(descripcion_simple), true),
  '{descripcion_simple}', to_jsonb(descripcion_simple), true
)
where coalesce(descripcion_simple, '') <> '';

update public.ipanel i
set descripcion = coalesce(i.descripcion, p.descripcion, p.data->>'descripcion'),
    descripcion_simple = coalesce(i.descripcion_simple, p.descripcion_simple, p.data->>'DescripcionSimple', p.data->>'descripcion_simple')
from public.preproduccion_valores_ipanels p
where p.partida = i.partida;
