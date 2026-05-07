# Patch integrador: sincronizacion y listado de Ipanels

Este patch agrega el flujo de Ipanels al integrador:

- Backend: sincroniza `Paneles.dbo.NTASVTAS` hacia `public.ipanel` en Supabase.
- Frontend: agrega una nueva seccion `Ipanels` para listar registros y ejecutar la sincronizacion.

## Archivos incluidos

```txt
ipanel_integrador_patch/
  dflex-sync-backend/
    ipanelSyncModule.js
    scripts/
      patch_server_ipanel.js
  dflex-sync-frontend/
    src/pages/IpanelsPage.jsx
    scripts/patch_app_ipanel.js
  README.md
```

## Instalacion

Copiar el contenido de este zip encima del repo `integrador`.

Luego aplicar los patches:

```bash
# Backend
cd dflex-sync-backend
node scripts/patch_server_ipanel.js
node --check server.js
node --check ipanelSyncModule.js

# Frontend
cd ../dflex-sync-frontend
node scripts/patch_app_ipanel.js
```

Despues reiniciar backend y frontend.

## Endpoints agregados

### Listado

```http
GET /api/ipanel
GET /api/ipanel?partida=123
GET /api/ipanel?nv=123
```

Devuelve registros desde `public.ipanel`.

### Ultima sincronizacion

```http
GET /api/ipanel/last-sync
```

Devuelve `lastSyncAt` usando `max(updated_at)` de `public.ipanel`.

### Sincronizacion

```http
POST /api/sync/ipanel
Content-Type: application/json

{
  "limit": 10000
}
```

Tambien acepta filtro puntual:

```json
{
  "partida": 123,
  "nv": 123,
  "limit": 10000
}
```

Requiere rol `admin`, igual que las acciones sensibles del integrador.

## Nueva pantalla frontend

Se agrega la seccion `Ipanels` al menu principal.

Permite:

- Buscar por `partida` / `NV`.
- Ver fecha de ultima sincronizacion.
- Sincronizar desde SQL Server hacia Supabase.
- Ver listado con columnas principales:
  - Partida
  - NV
  - Fecha NV
  - Plan entrega
  - Diseño
  - Guillotina
  - Plegado
  - Pintura
  - Inyección
  - Despacho
  - Observaciones

## Mapeo SQL -> Supabase

Como `Paneles.dbo.NTASVTAS` no trae una columna `partida` en el SELECT informado, se usa:

```txt
partida = numero
nv = numero
fecha_nv = fecha
fecha_plan_entrega = fechaent
observaciones = observ + obs + oc + idpedido + cliente/direccion
```

No se aplican formulas y no se modifican los estados productivos existentes.

## Recomendado en Supabase

Para evitar duplicados por concurrencia, crear un indice unico por partida:

```sql
create unique index if not exists ipanel_partida_unique_idx
on public.ipanel using btree (partida);
```
