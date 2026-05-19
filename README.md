# Integrador - copy/replace

Copiar estos archivos dentro del repo `integrador`, respetando la misma estructura de carpetas:

- `dflex-sync-frontend/src/pages/FormulasPage.jsx`
- `dflex-sync-backend/measurementMappings.js`

Qué cambia:

- Oculta el bloque `Asignador de propiedades desde medición` usando `hidden`.
- Agrega el bloque visible `Asignador de propiedades desde Nota de venta`.
- Permite elegir para cada propiedad origen de la NV qué propiedad existente del integrador debe recibir ese valor.
- Guarda esas asignaciones en la tabla `public.presupuestador_production_property_assignments`, que es la tabla usada por el flujo de Nota de venta del presupuestador.
- No requiere modificar `server.js`.

Después de copiar/reemplazar:

```bash
cd dflex-sync-backend
npm install
npm start
```

y en otra terminal:

```bash
cd dflex-sync-frontend
npm install
npm run build
```
