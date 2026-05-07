# Ipanels frontend - reemplazo directo

Copiar estas carpetas encima del repo `integrador`, reemplazando archivos existentes cuando pregunte.

Incluye:

- `dflex-sync-frontend/src/App.jsx`: App completo con la nueva seccion `Ipanels` en el menu.
- `dflex-sync-frontend/src/pages/IpanelsPage.jsx`: pagina nueva para listar/sincronizar ipanels.

Despues de copiar:

```bash
cd dflex-sync-frontend
npm run build
```

Si el boton aparece pero la pagina tira HTTP 404, falta aplicar el backend de ipanel (`/api/ipanel`, `/api/ipanel/last-sync`, `/api/sync/ipanel`).
