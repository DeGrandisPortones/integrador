Parche listo para copiar y reemplazar.

Archivos incluidos:
- dflex-sync-backend/server.js
- dflex-sync-frontend/src/pages/FormulasPage.jsx

Qué agrega:
- Nueva API GET /api/property-value-options?property=...
- Nueva sección "Valores" en FormulasPage
- Dos desplegables:
  1) Propiedad
  2) Valor (con cantidad entre paréntesis)

Uso:
1. Reemplazá cada archivo en tu repo integrador por el archivo homónimo de este zip.
2. Reiniciá backend y frontend.
3. Entrá a la pantalla de fórmulas.
4. En la nueva sección "Valores", elegí una propiedad y luego el valor.

Nota:
- Los valores salen de preproduccion_valores.data en Supabase.
- La búsqueda del nombre de la propiedad es case-insensitive.
