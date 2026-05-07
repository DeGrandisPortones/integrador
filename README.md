# Ipanels -> preproduccion_valores_ipanels

Este zip reemplaza la sincronización de ipanels para que deje de escribir en `public.ipanel` y empiece a escribir en:

```sql
public.preproduccion_valores_ipanels
```

La pantalla del integrador sigue mostrando la data directa desde SQL Server (`Paneles.dbo.NTASVTAS`). Supabase queda como destino de sincronización.

## Archivos incluidos

```txt
dflex-sync-backend/package.json
dflex-sync-backend/registerIpanelRoutes.js
dflex-sync-backend/sql/create_preproduccion_valores_ipanels.sql
```

## 1. Crear tabla en Supabase

Ejecutar en Supabase SQL Editor:

```sql
-- contenido de dflex-sync-backend/sql/create_preproduccion_valores_ipanels.sql
```

## 2. Copiar archivos

Copiar el contenido del zip encima del repo y reemplazar archivos.

## 3. Reiniciar backend

```bash
cd dflex-sync-backend
npm install
npm start
```

## Endpoints

```txt
GET  /api/ipanel              -> muestra data directa desde SQL Server
GET  /api/ipanel/sql          -> alias directo SQL
GET  /api/ipanel/last-sync    -> lee MAX(updated_at) de preproduccion_valores_ipanels
POST /api/sync/ipanel         -> sincroniza SQL -> preproduccion_valores_ipanels
```

## Mapeo

```txt
partida = SQL.numero
nv = SQL.numero
fecha_nv = SQL.fecha
fecha_plan_entrega = SQL.fechaent
data = fila completa de Paneles.dbo.NTASVTAS + campos normalizados
```
