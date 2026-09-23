# referencia

Implementación de referencia de la skill: una pantalla de **facturas de
cobranza** construida y auditada con ella. Next 16 + TanStack Table v9 + CSS
Modules (sin Tailwind), Sileo para los avisos y ExcelJS para la carga masiva.
Los datos son simulados y deterministas (137 facturas); llegan como llegarían
de Postgres (`numeric` como texto, `date` como `YYYY-MM-DD`) para ejercitar
esas trampas.

## Levantarla

```bash
cp -R <directorio de la skill>/referencia ~/data-table-referencia   # ~/.claude/skills/data-table o .claude/skills/data-table del repo
cd ~/data-table-referencia
npm ci
npx next dev -p 3022          # http://localhost:3022
```

## Verificarla

```bash
npm run check                 # escape CSV + paridad esquema ↔ db/facturas.sql + validador
npx playwright install chromium webkit   # la primera vez
node sondas/auditar.mjs       # 22 checks de la tabla (chromium + webkit)
node sondas/crear.mjs         # 8 del alta y la carga masiva
node sondas/sileo.mjs         # 8 de la capa de avisos
```

Las sondas esperan la app en `:3022`. Corre una a la vez: en paralelo, WebKit
puede cerrarse por falta de recursos y parecer un fallo de la app.

La barra **Demo** de la pantalla cambia el escenario (vacío, error, red lenta) y
el rol (Administración / Cobranza / Consulta) para ver estados y permisos.

## Dónde está cada cosa

| Pieza | Archivo |
|---|---|
| Primitiva de tabla: buscador, chips, conteo, selección, orden, paginación, estados | `src/components/DataTable.tsx` |
| Menú ⋯ accesible (teclado, abre hacia arriba, sigue al scroll) | `src/components/ActionsMenu.tsx` |
| Drawer y Modal, con la lógica de capa compartida (foco, Tab, Esc, foco de regreso) | `src/components/Drawer.tsx`, `Modal.tsx`, `useCapaModal.ts` |
| Avisos con Sileo y sus ajustes (skill sileo-avisos) | `src/components/AvisosToaster.tsx`, `src/lib/avisos.ts`, sección Sileo de `src/app/globals.css` |
| Columnas por tipo (`colNumero`, `colFecha`, `colEnum`), búsqueda sin acentos | `src/lib/tabla.tsx` |
| CSV con BOM y fórmulas neutralizadas | `src/lib/csv.ts` |
| Permisos: una regla para menú, drawer, acciones masivas y alta | `src/lib/facturas.ts` (`puede`, `puedeCrear`) |
| Estado de la tabla ↔ URL, validado | `src/lib/url.ts` |
| Tabla real (DDL) | `db/facturas.sql` |
| Esquema de captura (espejo de la tabla) y validador único | `src/lib/esquema.ts` |
| Alta: modal con formulario y carga masiva | `src/app/CrearFacturas.tsx` |
| Plantilla .xlsx (listas, reglas de Excel, instrucciones) y lectura de la carga | `src/lib/plantilla.ts` |

`package.json` fija `uuid@^11` con `overrides`: ExcelJS arrastra una versión
con aviso de seguridad (no alcanzable, pero así queda en 0).
