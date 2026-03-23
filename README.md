# Integrador - asignador de propiedades desde medición

## Qué trae este patch
- **Nuevo backend** `dflex-sync-backend/measurementMappings.js`
  - crea / usa la tabla `preproduccion_property_mappings`
  - expone catálogo fijo de secciones/campos de medición
  - guarda mappings por propiedad del integrador
  - ya trae resolvers: `identity`, `min`, `max`, `sum`, `first_non_empty`, `join_csv`

- **Frontend reemplazo** `dflex-sync-frontend/src/pages/FormulasPage.jsx`
  - mantiene la grilla actual de fórmulas
  - agrega abajo el **asignador desde medición**
  - por cada propiedad del integrador podés elegir:
    - sección origen
    - campo origen
    - resolver
    - activo sí/no

- **Snippets para `server.js`**
  - import
  - inicialización de tabla
  - endpoints:
    - `GET /api/measurement-source-catalog`
    - `GET /api/property-mappings`
    - `POST /api/property-mappings`

## Orden recomendado
1. Copiar `measurementMappings.js` al backend
2. Reemplazar `FormulasPage.jsx` en frontend
3. Aplicar los snippets de `server.snippets.md` en `server.js`
4. Reiniciar backend y frontend

## Nota
Este patch deja **listo el configurador del mapping** en integrador.
El paso siguiente es conectar estos mappings al writer que meta `measurement_form` desde presupuestador en `preproduccion_valores`, para que los valores resueltos entren automáticamente en cada propiedad.
