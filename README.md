# Integrador - reemplazo directo

Copiar la carpeta `dflex-sync-frontend` sobre la raiz del repo `integrador` y reemplazar archivos cuando el sistema lo pida.

Archivo incluido:

- `dflex-sync-frontend/src/pages/FormulasPage.jsx`

Cambio principal:

- En `Asignador de propiedades desde Nota de venta` se agregan dos inputs arriba de la tabla:
  - `NV integrador`
  - `NV presupuestador`
- La tabla muestra columnas nuevas:
  - `Valor integrador`
  - `Valor presupuestador`
  - `Comparacion`

Luego de copiar, ejecutar:

```bash
cd dflex-sync-frontend
npm install
npm run build
```
