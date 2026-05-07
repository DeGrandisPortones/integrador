# Patch integrador: sincronizacion ipanel

Este patch agrega la sincronizacion desde `Paneles.dbo.NTASVTAS` hacia `public.ipanel`.

## Que agrega

- `GET /api/ipanel`: lista registros de Supabase `public.ipanel`.
- `GET /api/ipanel/last-sync`: devuelve `max(updated_at)` de `public.ipanel`.
- `POST /api/sync/ipanel`: trae datos desde SQL Server y los inserta/actualiza en `public.ipanel`.

## Mapeo usado

Como el SELECT informado de `Paneles.dbo.NTASVTAS` no incluye una columna `partida`, el patch usa:

- `partida = numero`
- `nv = numero`
- `fecha_nv = fecha`
- `fecha_plan_entrega = fechaent`
- `observaciones = observ + obs + oc + idpedido + datos del cliente/direccion`

No se actualizan los estados de procesos ni sus timestamps (`guillotina`, `plegado`, `pintura`, `inyeccion`, `despacho`, `diseno`).

## Instalacion

Copiar la carpeta `dflex-sync-backend` del zip encima de la carpeta `dflex-sync-backend` del repo `integrador`.

Luego ejecutar desde `dflex-sync-backend`:

```bash
node scripts/patch_server_ipanel.js
node --check server.js
node --check ipanelSyncModule.js
```

Despues reiniciar el servicio backend.

## Uso

Sincronizar todo el lote default, maximo 10000:

```bash
curl -X POST "$BACKEND_URL/api/sync/ipanel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":10000}'
```

Sincronizar una NV puntual:

```bash
curl -X POST "$BACKEND_URL/api/sync/ipanel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nv":1234}'
```

Listar:

```bash
curl "$BACKEND_URL/api/ipanel" -H "Authorization: Bearer $TOKEN"
```

Ultima sincronizacion:

```bash
curl "$BACKEND_URL/api/ipanel/last-sync" -H "Authorization: Bearer $TOKEN"
```

## Recomendado en Supabase

Para evitar duplicados por concurrencia, conviene agregar un indice unico por partida:

```sql
create unique index if not exists ipanel_partida_unique_idx
on public.ipanel using btree (partida);
```

El codigo no depende de ese indice porque hace upsert manual por `partida`, pero el indice unico deja la tabla protegida.
