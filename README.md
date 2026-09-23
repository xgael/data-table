# data-table

Skill de Claude Code para **construir o auditar tablas de datos** (data grids)
hasta dejarlas bien, con evidencia.

Una tabla es la promesa de que se puede **comparar, ordenar y encontrar**. Casi
todo lo que rompe esa promesa no se ve en una captura: el orden que parecía
numérico y era alfabético, la búsqueda que no encuentra lo que está en
pantalla, el `.slice(0, 50)` que corta sin avisar. Por eso la skill carga tanto
en verificación como en diseño.

## Instalar

```bash
git clone https://github.com/xgael/data-table ~/.claude/skills/data-table
```

Se activa con «pon una tabla acá», «convierte esta lista en tabla», «audita las
tablas», «deja perfectas las tablas de <módulo>», «descargar plantilla»,
«importar desde Excel»…

## Dos modos

- **Construir**: tabla, lista o tarjetas; el contrato de columnas (el accessor
  decide, el cell decora); acciones de fila en un menú ⋯ como última columna;
  permisos; detalle en drawer; paginación; y el **alta**: un modal con
  formulario de un registro o **carga masiva por .xlsx**, con una plantilla que
  se genera desde la tabla de la base.
- **Auditar**: inventario del repo (`scripts/inventario.sh`), 14 checks con ID y
  severidad, arreglo por la primitiva compartida y una matriz tabla × check
  donde cada ✓ está respaldado por una sonda corrida.

## Las trampas que documenta

Todas encontradas construyendo o midiendo, con su síntoma exacto:

- `numeric` de Postgres llega como texto: `"180000" < "21150"`. Delator en
  TanStack: si el primer clic de una columna numérica ordena ascendente, el
  accessor entrega texto.
- Buscar «Cámara» devuelve cero porque el accessor entrega `camara`.
- Un menú ⋯ que se cierra con cualquier `scroll` **no abre** en la última fila
  visible: el clic enfoca el botón, el navegador desplaza y ese scroll lo cierra.
- Un `<select>` dentro de su `<label>` se anuncia como «Estado Todos Vencida…».
- La sonda de permisos que pasa porque la página sólo tenía un estado: 25
  esperadas = 25 reales, y la regla por estado nunca se probó.
- `maxLength` recorta en silencio lo que la persona pega.
- ExcelJS entrega las fechas a medianoche UTC: leídas en hora local, en México
  se corre el día.
- Las reglas de Excel se saltan pegando valores: la carga revalida todo con el
  mismo validador que el formulario.
- La plantilla y la tabla se desincronizan en silencio: una autoprueba las
  compara, **y se rompe a propósito una vez** para ver que suena.
- TanStack Table v9 no es v8: `useTable` + `tableFeatures`, `sortFn`, y
  `getIsSome…Selected()` ahora es «al menos una».

## Contenido

```
SKILL.md                  la skill (modo construir)
references/
  auditoria.md            modo auditar: inventario, checks T1–T14, matriz
  verificacion.md         recetas Playwright ejecutables
scripts/inventario.sh     pistas estáticas de un repo (sólo lee)
referencia/               implementación completa y sus sondas (ver LEEME.md)
```

`referencia/` es una pantalla de facturas construida y auditada con la skill:
22 checks de la tabla, 8 del alta y 8 de los avisos, todos en verde.

La capa de avisos usa Sileo con la skill hermana
[sileo-avisos](https://github.com/xgael/sileo-avisos).

## Licencia

MIT
