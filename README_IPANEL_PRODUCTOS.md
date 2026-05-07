# Integrador - iPanels con descripcion de productos

Reemplazo directo para sumar a la consulta de iPanels la descripcion del producto.

## Relacion aplicada

- `Paneles.dbo.NTASVTAS.numero` se vincula con `Paneles.dbo.INTASVTAS.numero`.
- `Paneles.dbo.INTASVTAS.producto` se vincula con `Paneles.dbo.PRODUCTOS.codigo`.
- Se trae `Paneles.dbo.PRODUCTOS.descripcion` como:
  - `producto_descripcion`
  - `producto_descripciones`
  - `descripcion_producto`

Si una nota tiene mas de un producto, las descripciones se concatenan separadas por ` | `.

La pantalla del integrador muestra la columna `Producto / descripcion`.
La sincronizacion guarda esos campos dentro de `preproduccion_valores_ipanels.data`.

## Archivos incluidos

```txt
dflex-sync-backend/package.json
dflex-sync-backend/registerIpanelRoutes.js
dflex-sync-frontend/src/pages/IpanelsPage.jsx
```

## Uso

Copiar el contenido del zip encima del repo y reemplazar archivos.

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
