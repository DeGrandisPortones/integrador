# Ipanels - reemplazo directo SQL -> Supabase

Este zip es para copiar encima del repo `integrador` y reemplazar archivos directamente.

Incluye:

- `dflex-sync-backend/package.json`
- `dflex-sync-backend/registerIpanelRoutes.js`
- `dflex-sync-frontend/src/App.jsx`
- `dflex-sync-frontend/src/pages/IpanelsPage.jsx`

## Cambios

- La seccion `Ipanels` del front muestra la data directa desde SQL Server (`Paneles.dbo.NTASVTAS`).
- `GET /api/ipanel` ahora devuelve filas desde SQL, no desde Supabase.
- `POST /api/sync/ipanel` sincroniza SQL -> Supabase (`public.ipanel`).
- Al entrar al integrador, `App.jsx` dispara una sincronizacion automatica SQL -> Supabase.
- En la pantalla `Ipanels` sigue existiendo el boton manual `Sincronizar ipanels`.

## Comandos recomendados

Backend:

```bash
cd dflex-sync-backend
npm install
npm start
```

Frontend:

```bash
cd dflex-sync-frontend
npm install
npm run build
```

## Endpoints

- `GET /api/ipanel` listado directo desde SQL.
- `GET /api/ipanel/sql` alias del listado directo desde SQL.
- `GET /api/ipanel/last-sync` ultima actualizacion registrada en Supabase.
- `POST /api/sync/ipanel` sincroniza desde SQL hacia Supabase.
