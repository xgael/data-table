# Auditar tablas existentes — y dejarlas bien

Modo AUDITAR de la skill. Se entra con "audita las tablas", "revisa esta tabla",
"deja perfectas las tablas de <módulo>". El resultado no es un informe: son las
tablas arregladas **y** una matriz que prueba qué se midió en cada una.

El criterio de cada check vive en `SKILL.md` (§3–§8) y las heurísticas de producto
en `ux-audit/references/admin-tables.md`. Esto es el procedimiento.

---

## 1. Inventario (antes de opinar)

```bash
~/.claude/skills/data-table/scripts/inventario.sh <repo>
```

Sólo lee. Devuelve pistas en bruto: dónde hay `<table>` o la primitiva, columnas
definidas, listas con `·`/`—` que quizá debían ser tabla, `.slice(0, N).map`,
`accessorKey` sobre montos/fechas, búsqueda sin normalizar, expansión inline,
paginación de servidor. **Cada pista se confirma** abriendo el archivo; el script
no decide nada.

Con eso arma la lista de trabajo, una fila por tabla:

| Tabla | Ruta en la app | Componente | Primitiva o `<table>` crudo | Paginación (cliente/servidor) | Roles que la ven |
|---|---|---|---|---|---|

- **Alcance**: si el pedido nombra un módulo, sólo ese. Si el proyecto tiene
  módulos apagados o sobras del template, no se auditan (pregúntate si la ruta
  es alcanzable en el menú).
- **Excluye** lo que no es listado: tablas de markdown renderizado, matrices de
  permisos, partidas dentro de un formulario, calendarios. Anótalas como
  `n.a.` con el motivo, no las borres de la lista.
- **Roles**: de la tabla de permisos del backend, no del menú. Una tabla que su
  rol destinatario no puede abrir es el hallazgo más grave de todos.

## 2. ¿Hay primitiva compartida?

Cuenta consumidores: `grep -rl '<DataTable' src | wc -l`. Si 10 tablas usan el
mismo `DataTable`, un defecto de la primitiva son 10 defectos y **un** arreglo.

Audita la primitiva primero contra los checks T4–T9 y T12 (los que dependen de
ella: cromo, paginación, estados, aria, menú). Las tablas de `<table>` crudo
heredan todo por separado: anota cuáles convendría migrar a la primitiva y
hazlo sólo si está en el alcance.

## 3. Los checks

Cada check tiene ID para que las matrices se comparen entre corridas. Severidad:

- **A — la tabla miente o no sirve**: dato incorrecto, inalcanzable o a quien no
  corresponde. Se arregla siempre.
- **M — fricción**: se puede trabajar, pero cuesta.
- **B — pulido**.

| ID | Check | Sev. | Cómo se mide |
|---|---|---|---|
| T1 | Forma correcta: ningún `·` uniendo atributos comparables; no es tabla si es feed/catálogo/matriz (§1) | M | código + pantalla |
| T2a | Orden numérico real (`180000` al final en ascendente; en TanStack el 1er click sale desc) | A | sonda verificacion §2 |
| T2b | Fechas por instante, no por texto formateado | A | sonda con fechas de meses distintos |
| T2c | Enums con `sortFn` (v8: `sortingFn`) de rango; `NULL` al extremo y rotulado | M | click ×2 |
| T2d | Orden por defecto útil (reciente/urgente), documentado si viene del backend | M | primer render |
| T3 | Búsqueda encuentra lo que se VE: etiqueta con acento y mayúscula | A | sonda verificacion §3 |
| T4 | Conteo visible; filtros visibles como chips con "limpiar"; filtrar regresa a pág. 1; el filtro aplica a todas las vistas | M | pantalla |
| T5a | Números a la derecha + `tabular-nums`, `th` alineado | M | computed style |
| T5b | Códigos traducidos con los mapas del proyecto; nada de UUID ni `en_uso` en pantalla | M | pantalla |
| T5c | Nada desborda la celda (chromium + webkit, 1024/1280/1600) | M | sonda verificacion §1 |
| T5d | Encabezado sticky en tablas largas; truncado con `title` | B | scroll |
| T6a | Acciones en menú ⋯, última columna, encabezado vacío, sin orden | M | sonda 5b.1–2 |
| T6b | Menú accesible: nombre con el registro, `aria-haspopup`/`expanded`, Enter/Esc/flechas, foco devuelto | M | sonda 5b.3–4 |
| T6c | Destructiva al final, separada, con Undo o confirmación | A si borra sin red | click |
| T7 | Detalle rico en drawer (no expansión); avisos (Sileo) clicables encima, sin tapar su pie y con los ajustes de la skill sileo-avisos | M | hit-test §7 + `sileo.mjs` S1–S8 |
| T8a | Sin recortes silenciosos (`.slice` con contador que dice más) | A | contar filas vs contador |
| T8b | Paginación alcanza la última página y el contenido cambia; servidor pide `page=2` | A | sonda §4 + red |
| T8c | Filtros/orden/página sobreviven ir al detalle y volver | M | navegar ida y vuelta |
| T9 | Estados: esqueleto de filas, vacío con CTA, "sin resultados" ≠ "sin registros", error con reintentar, sin salto al cargar | M | red lenta + filtro `zzz` + API caída |
| T10 | Selección masiva (si existe): dice el alcance ("12 de esta página" vs total) | A | seleccionar todo |
| T11 | Permisos: el rol destinatario la abre; acciones filtradas por la MISMA regla del servidor (conteo botones = filas permitidas); ocultar si nunca podrá, deshabilitar con razón si le falta un paso | A | dos usuarios de rol distinto |
| T12 | `th` con `aria-sort`, tabla con nombre (`caption`/`aria-label`); tema oscuro legible; a 360 px scroll horizontal en su contenedor, no en la página | M | axe/DOM + `colorScheme: 'dark'` |
| T14 | Alta: botón por permiso; formulario y carga comparten un validador que es espejo de la tabla (autoprueba contra el DDL); plantilla con listas/reglas; errores por fila; importar sólo válidas; Deshacer | A si la carga inserta lo que la tabla rechaza | `referencia/sondas/crear.mjs` C1–C7 + `esquema.check` |
| T13 | Pruebas del proyecto en verde tras el cambio (y si ya fallaban antes, dicho) | A | runner; si falla, repetir en worktree limpio |

`n.a.` es válido (T10 sin selección masiva) pero lleva motivo.

## 4. Medir

- **Datos**: local o staging con datos sembrados y **marcados como tuyos**
  (verificacion §8). Nunca producción, nunca escribir sobre filas ajenas, nunca
  identificar lo propio por posición ("la primera fila") ni por prefijo del
  dominio. Si no hay entorno donde escribir, las sondas de escritura (T6c,
  T10) quedan `no medido` y se dice.
- **Estático primero, pantalla después**: el código dice dónde mirar; la
  pantalla dice si falla. Un check se marca ✓ sólo con la sonda corrida, no por
  haber leído el código.
- **Un script por tabla** a partir de `verificacion.md`, en el scratchpad. Guarda
  la salida: es la evidencia de la matriz.

## 5. Arreglar por patrón

Orden: primero todos los **A**, luego M, luego B. Y del más ancho al más angosto:

1. **Primitiva** (`DataTable`, `ActionsDropdown`, `Drawer`, toaster): un arreglo,
   N tablas. Revisa a todos sus consumidores después: cambiar una prop puede
   romper a quien la usaba distinto.
2. **Helpers de columna**, si el proyecto no los tiene y hay ≥3 tablas con el
   mismo bug de accessor: uno por tipo (`colNumero`, `colFecha`, `colEnum`), en
   el archivo donde vive la primitiva. La versión probada (TanStack v9, NULL al
   final con `sortUndefined: 'last'` y rotulado en la celda, enum que busca por
   la etiqueta y ordena por rango) está en `referencia/src/lib/tabla.tsx`. En
   v8 cambia `sortFn` por `sortingFn` y el tipo `ColumnDef<T>` sin `features`.
   Si el proyecto ya tiene equivalentes, úsalos.
3. **Tabla por tabla**: lo que es de esa pantalla (columnas por la tarea,
   traducciones, orden por defecto, permisos de sus acciones).

No toques lo que no está en la matriz. Un hallazgo fuera de tablas se anota al
final, no se arregla de paso.

## 6. Re-medir y entregar

Corre otra vez las mismas sondas: antes → después con la misma salida. Luego las
pruebas del proyecto (T13).

La entrega lleva tres piezas:

**a) Matriz** tabla × check: `✓` medido y pasa, `✗` falla (queda abierto),
`✓*` arreglado en esta corrida, `n.a.` con motivo, `—` no medido.

| Tabla | T1 | T2a | T2b | T3 | … | T13 |
|---|---|---|---|---|---|---|

**b) Arreglos**: por patrón, con el archivo y cuántas tablas cubre cada uno
(`DataTable.tsx: aria-sort en th → 14 tablas`).

**c) Lo que queda**, en la misma entrega, no cuando pregunten: cada `✗` y cada
`—` con el motivo (sin entorno para escribir, sin usuario de ese rol, fuera de
alcance) y qué haría falta para cerrarlo.

"Perfecta" = cero `✗` de severidad A y M en la matriz, con cada `✓` respaldado
por una sonda. Si quedan `—`, la tabla está revisada, no perfecta: dilo así.
