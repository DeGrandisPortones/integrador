# Ipanel backend - reemplazo directo

Este zip agrega las rutas de backend que necesita la seccion **Ipanels** del frontend:

- `GET /api/ipanel`
- `GET /api/ipanel/last-sync`
- `POST /api/sync/ipanel`

## Como aplicar

Copiar el contenido del zip encima del repo y reemplazar archivos.

Archivos incluidos:

```txt

dflex-sync-backend/package.json
dflex-sync-backend/registerIpanelRoutes.js
```

Despues, en backend:

```bash
cd dflex-sync-backend
npm install
npm start
```

En desarrollo:

```bash
npm run dev
```

## Importante

El error `Cannot GET /api/ipanel` significa que el frontend ya esta bien, pero el backend desplegado no tiene esa ruta.
Despues de copiar estos archivos hay que redesplegar/reiniciar el backend.

La sincronizacion lee desde:

```sql
Paneles.dbo.NTASVTAS
```

y escribe en:

```sql
public.ipanel
```

El mapeo usado es:

```txt
partida = numero
nv = numero
fecha_nv = fecha
fecha_plan_entrega = fechaent
observaciones = datos de cliente, direccion, observaciones, OC e idpedido
```

No pisa los estados de proceso ya existentes, solo actualiza datos administrativos (`nv`, fechas y observaciones).
