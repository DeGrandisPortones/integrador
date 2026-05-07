-- Tabla destino para sincronizar ipanels desde SQL Server:
-- Paneles.dbo.NTASVTAS -> public.preproduccion_valores_ipanels

create table if not exists public.preproduccion_valores_ipanels (
  id bigint generated always as identity not null,
  partida integer not null,
  nv integer null,
  source text not null default 'SQL'::text,
  sql_database text not null default 'Paneles'::text,
  sql_schema text not null default 'dbo'::text,
  sql_table text not null default 'NTASVTAS'::text,
  fecha_nv date null,
  fecha_plan_entrega date null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint preproduccion_valores_ipanels_pkey primary key (id),
  constraint preproduccion_valores_ipanels_partida_key unique (partida)
) tablespace pg_default;

create index if not exists preproduccion_valores_ipanels_partida_idx
  on public.preproduccion_valores_ipanels using btree (partida) tablespace pg_default;

create index if not exists preproduccion_valores_ipanels_nv_idx
  on public.preproduccion_valores_ipanels using btree (nv) tablespace pg_default;

create index if not exists preproduccion_valores_ipanels_fecha_nv_idx
  on public.preproduccion_valores_ipanels using btree (fecha_nv) tablespace pg_default;

create index if not exists preproduccion_valores_ipanels_fecha_plan_entrega_idx
  on public.preproduccion_valores_ipanels using btree (fecha_plan_entrega) tablespace pg_default;

create index if not exists preproduccion_valores_ipanels_data_gin_idx
  on public.preproduccion_valores_ipanels using gin (data) tablespace pg_default;

-- Si ya existe public.set_updated_at(), este bloque no la pisa.
-- Si no existe, la crea para mantener updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_preproduccion_valores_ipanels_updated_at
  on public.preproduccion_valores_ipanels;

create trigger trg_preproduccion_valores_ipanels_updated_at
before update on public.preproduccion_valores_ipanels
for each row
execute function public.set_updated_at();
