# Bloqueo de iPanels en integrador

Este reemplazo hace que estas partidas iPanel no entren nunca a `public.preproduccion_valores_ipanels` durante la sincronizacion del integrador.

Archivos:

```txt
dflex-sync-backend/registerIpanelRoutes.js
dflex-sync-backend/package.json
dflex-sync-backend/sql/block_ipanels_100000_100087.sql
dflex-sync-frontend/src/pages/IpanelsPage.jsx
```

## Aplicacion

1. Copiar y reemplazar archivos en el repo `integrador`.
2. Ejecutar en Supabase:

```sql
dflex-sync-backend/sql/block_ipanels_100000_100087.sql
```

3. Reiniciar backend:

```bash
cd dflex-sync-backend
npm install
npm start
```

4. Recompilar frontend:

```bash
cd dflex-sync-frontend
npm install
npm run build
```

## Que cambia

- Crea/usa `public.ipanel_sync_blocklist`.
- La sincronizacion `POST /api/sync/ipanel` omite partidas bloqueadas.
- Antes de sincronizar, borra de `preproduccion_valores_ipanels` cualquier partida bloqueada que ya estuviera cargada.
- La pantalla de integrador marca las filas bloqueadas con la columna `Bloqueado sync`.
- El resultado de sync muestra `bloqueados` y `eliminados bloqueados existentes`.

La lista tambien queda hardcodeada en backend como proteccion adicional.
