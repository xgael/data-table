---
name: data-table
description: >-
  Construir o AUDITAR tablas de datos (data grids) hasta dejarlas bien, con
  evidencia. Construir: "pon una tabla acá", "esto debería ser tabla",
  "convierte esta lista en tabla", "make this a table", "add sorting/search".
  Auditar: "audita las tablas", "revisa esta tabla", "deja perfectas las tablas
  de <módulo>", "table audit". Cubre la decisión tabla-vs-lista-vs-tarjetas, el
  contrato de columnas (accessor vs cell), las trampas que rompen orden y
  búsqueda en silencio (números como texto, etiquetas con acentos, enums, NULL),
  acciones de fila en menú de tres puntos como última columna, permisos,
  detalle en drawer, escala y paginación, alta en modal (formulario o carga
  masiva .xlsx con plantilla generada desde la tabla de la base, "descargar
  plantilla", "importar desde Excel"), avisos con Sileo (Deshacer, promesas,
  sus trampas medidas); y para auditar, un inventario del
  repo, 14 checks con ID y severidad, arreglo por primitiva compartida y una
  matriz tabla × check respaldada por sondas Playwright.
---

> **¿El repo trae su propia copia?** Si existe `.claude/skills/data-table/SKILL.md` en
> la raíz del repo en el que trabajas, **lee ese archivo y síguelo en lugar de
> este**: es la copia nativa del proyecto, con la sección «En este template» que
> apunta a sus archivos. (Claude Code da prioridad a la skill personal sobre la
> del proyecto cuando se llaman igual, así que sin esta regla la copia del repo
> nunca se usaría.)

# Tablas de datos — construirlas bien

Una tabla no es "una lista con bordes". Es la promesa de que se puede **comparar,
ordenar y encontrar**. Si esa promesa no se cumple, la tabla miente y estorba más
que la lista que reemplazó.

Casi todo lo que rompe una tabla no se ve en la captura: el orden que parecía
numérico y era alfabético, la búsqueda que no encuentra lo que está en pantalla,
el `.slice(0, 50)` que corta sin avisar. Por eso este documento carga tanto en
verificación como en diseño.

**Dos modos:**
- **Construir** una tabla nueva o convertir un listado → sigue este documento (§1–§9).
- **Auditar** tablas existentes y dejarlas bien → `references/auditoria.md`
  (inventario con `scripts/inventario.sh`, checks T1–T13, arreglo por patrón,
  matriz de entrega). Usa §3–§8 de aquí como criterio de cada check.

**Implementación de referencia**: `referencia/` (Next 16 + TanStack Table v9,
CSS Modules; cómo levantarla en `referencia/LEEME.md`). Primitivas
`DataTable`, `ActionsMenu`, `Drawer`, `Modal`, helpers de columna en
`src/lib/tabla.tsx`, alta en `src/app/CrearFacturas.tsx`, y tres juegos de
sondas en `referencia/sondas/`: `auditar.mjs` (22 de la tabla), `crear.mjs` (8
del alta y la carga masiva) y `sileo.mjs` (8 de los avisos). Cópiale el patrón,
no el directorio.

**TanStack Table v9** (lo que instala un proyecto nuevo) no es v8: `useTable({
features, columns, data })` con `tableFeatures({ …Feature, sortedRowModel:
createSortedRowModel() })`; sin la feature registrada su API no existe (p. ej.
`getVisibleLeafColumns` pide `columnVisibilityFeature`). `sortingFn → sortFn`,
`meta` se tipa con `columnMeta: metaHelper<T>()`, y `getIsSome…Selected()` ahora
es "al menos una" (indeterminado = `some && !all`). El paquete trae sus propias
skills en `node_modules/@tanstack/*/skills/`: léelas antes de escribir.

---

## 1. ¿Tabla, lista o tarjetas?

Aplica esta prueba al REGISTRO, no a la pantalla:

**Tabla** si se cumplen las tres:
1. Los registros son del mismo tipo y tienen **3+ atributos comparables** entre sí
   (montos, fechas, cantidades, estados, categorías).
2. La tarea es **escanear, comparar, ordenar o filtrar** — no "leer uno".
3. La colección **crece** con el uso.

**Señal inequívoca de que debía ser tabla**: el código junta atributos en una
cadena, típicamente con `·`, `—` o `|`:

```tsx
// ✗ Cuatro columnas disfrazadas de oración. No se ordena, no se compara,
//   y la búsqueda encuentra por accidente.
<span>{num(m.seguidores)} seguidores · {num(m.vistas)} vistas · {m.engagement}% · {m.periodo}</span>
```

Cada dato que iba en ese `·` es una columna.

**Lista o tarjetas** cuando:
- Es un **feed cronológico** con cuerpo de texto largo (anuncios, notificaciones,
  bitácoras): la fila no tiene ancho para el cuerpo y ordenar por autor no sirve.
- Es un **catálogo visual** donde la imagen es el dato (productos de cara al
  cliente, galería de material).
- Es un **resumen de dashboard** (top-5, "próximas 3"): 1-2 datos y no crece.
- Son **partidas dentro de un formulario** (renglones de una cotización): son
  entrada de datos, no un listado que se explore.
- Es una **matriz** (curso × fase × mes): es una tabla, pero de las que no se
  ordenan; no le metas orden ni paginación.

**Ni tabla ni lista, si el módulo ya paginó en el servidor** → ver §7.

---

## 2. Receta de conversión

1. **Inventaria los atributos reales** del tipo, no los que se muestran hoy.
   Casi siempre hay campos útiles escondidos (quién es el dueño, cuándo se creó,
   el descuento aplicado). Léelos del `interface`, no de la UI.
2. **Elige columnas por la tarea**, no por el schema. Primera columna = el
   identificador que la persona reconoce (nombre, folio); nunca un UUID.
3. **Traduce los códigos** con los mapas de etiquetas que ya existen en el
   proyecto (`CATEGORIA_LABELS`, `ESTADO_LABELS`). Una tabla que muestra `en_uso`
   o `camara` es una tabla a medio hacer.
4. **Define cada columna con el contrato de §3.**
5. **Conserva los controles que ya funcionaban** (filtros por estado, botón de
   refrescar) y no dupliques buscadores (§7).
6. **Mueve el detalle rico al drawer** (§6) si la fila lo expandía hacia abajo.
7. **Verifica con §8** y actualiza las pruebas: los selectores `li` pasan a `tr`.

---

## 3. El contrato de una columna: `accessor` decide, `cell` decora

Regla única de la que salen la mitad de los bugs:

> El **accessor** es el valor con el que se ordena y se busca.
> El **cell** es cómo se ve.
> Si difieren en tipo o en texto, algo se va a romper en silencio.

| Tipo de columna | `accessor` devuelve | `cell` muestra |
|---|---|---|
| Texto | el texto | el texto (con estilo) |
| Número / dinero | **el número** | el formato (`1,234.50 MXN`) |
| Fecha | **el instante** (`+new Date(x)`) | la fecha formateada |
| Enum / catálogo | **la etiqueta visible** | badge o texto |
| Booleano | la etiqueta ("Activo") | badge |

```tsx
// ✓ ordena por instante, muestra texto legible
{
  id: 'created_at',
  header: 'Fecha',
  accessorFn: (r) => +new Date(r.created_at),
  cell: ({ row }) => fmtFecha(row.original.created_at),
}

// ✗ ordena "05 ago" < "12 jul" alfabéticamente
{ accessorKey: 'created_at', cell: ({ getValue }) => fmtFecha(getValue()) } // si el accessor es el texto
```

---

## 4. Las trampas que no se ven

### 4.1 Números que llegan como texto
Postgres `numeric` puede llegar como string según el driver. Ordenar entonces es
lexicográfico y `"180000" < "21150"`. **Verifícalo con datos, no leyendo**:
mete un valor con un dígito más que el resto y ordena ascendente. Si el grande
queda primero, es texto.

Hay un delator más rápido en TanStack Table: infiere la dirección del primer
click según el tipo del primer valor (`getAutoSortDir`) — **string → asc,
cualquier otra cosa → desc**. Entonces, en una columna que crees numérica: si el
primer click ordena ascendente, el accessor te está entregando texto. Es el mismo
bug visto de lado, y se detecta con un click.

### 4.2 Búsqueda sobre el valor crudo
El filtro global compara contra el accessor. Si el accessor es `camara` y en
pantalla dice `Cámara`, teclear lo que se ve devuelve **cero**. El accessor de una
columna de catálogo devuelve la **etiqueta**.

### 4.3 Enums ordenados alfabéticamente
`alto, bajo, medio` no es una severidad. Cualquier enum con orden semántico
(severidad, prioridad, etapa, talla) necesita `sortFn` (v8: `sortingFn`) con un rango explícito:

```tsx
const RANK = { alto: 0, medio: 1, bajo: 2, 'n/a': 3 }
sortFn: (a, b) => RANK[a.original.nivel] - RANK[b.original.nivel],   // v8: sortingFn
```

### 4.4 `NULL` tratado como cero
`stock: null` = "sin control de inventario", no "se agotó". Ordénalo al extremo
(`Number.POSITIVE_INFINITY`) y muéstralo como texto tenue ("Sin control"), nunca
como `0` ni como celda vacía sin explicación.

### 4.5 El orden por defecto
El default es el orden del arreglo. Si el backend ya ordena por lo que importa
(severidad, fecha desc), **no lo re-ordenes**: documéntalo con un comentario para
que nadie "arregle" el orden después. Si no ordena, ordena tú por la tarea:
lo urgente o lo reciente primero, nunca alfabético por accidente.

### 4.6 Recortes silenciosos
`items.slice(0, 50)` con un contador que dice 120 es una mentira. Si hay que
limitar, **pagina**; si truncas a propósito, dilo en pantalla.

### 4.7 Filtros que sólo aplican a una vista
Si la pantalla tiene dos vistas (tabla y calendario, por ejemplo) y el filtro
sólo afecta a una, el usuario ve datos filtrados sin control visible. O aplica a
las dos, o el control vive dentro de la vista a la que aplica.

### 4.8 Números sin alinear
Derecha + `font-variant-numeric: tabular-nums`, y el `th` alineado con su
columna. Sin eso no se comparan de un vistazo, que era el punto de la tabla.

---

## 5. Acciones por fila: siempre en un menú de tres puntos

**Regla de la casa, sin excepciones:** las acciones de una fila viven en un
**dropdown que abre desde un botón con el ícono de tres puntos verticales**
(kebab, `MoreVertical`), y ese botón es la **última columna** de la tabla.

Por qué es regla y no preferencia: una fila con cuatro botones compite con los
datos, cambia de ancho según el estado del registro (una fila con tres acciones y
la de al lado con una), no cabe en pantallas angostas y obliga a leer iconos
sueltos. Un solo punto de entrada por fila deja la tabla pareja y la acción
siempre en el mismo lugar.

```tsx
{
  id: 'acciones',
  header: '',            // sin encabezado: no se ordena ni se busca
  enableSorting: false,
  cell: ({ row }) => <ActionsDropdown … />,   // el componente del proyecto
}
```

Lo que el menú tiene que cumplir:

- **Columna final, encabezado vacío**, `enableSorting: false`, ancho fijo y
  pegada a la derecha. No metas ahí datos.
- **El disparador es un `<button>`** con nombre accesible ("Acciones de
  <registro>", no sólo "Acciones"), `aria-haspopup="menu"` y `aria-expanded`.
  El contenedor lleva `role="menu"` y cada opción `role="menuitem"`.
- **Teclado**: Enter/Espacio abre, Esc cierra y devuelve el foco al disparador,
  flechas recorren las opciones. Un menú que sólo responde al ratón no es un menú.
- **`stopPropagation` en el click del disparador** si la fila es clickeable, o
  abrir el menú también abrirá el detalle.
- **Orden de las opciones**: primero lo frecuente, la **destructiva al final y
  separada** (línea divisoria + color de peligro). Nunca la destructiva pegada a
  la de al lado.
- **Filtra por permiso, no deshabilites.** Si la API responde 403 a quien no es
  dueño, la opción no se lista. Lee la regla del backend y replícala; si no la
  puedes leer, no adivines.
- **Destructiva** → **Undo** optimista (aviso de **Sileo** con botón: skill
  **sileo-avisos**) o confirmación. La que no se puede
  deshacer (un valor enmascarado, un envío real) va con confirmación explícita.
- **Posición**: si el menú se renderea en un portal con `position: fixed`, calcula
  la posición ANTES de abrir y decide si abre hacia arriba cuando no hay espacio
  abajo. Un menú que se pinta un frame sin posicionar mueve el layout.
- **Nunca sólo-hover**: en touch no hay hover.
- **No cierres el menú con cualquier `scroll`.** Clic en un ⋯ a medio ver → el
  navegador lo enfoca y desplaza el contenedor para mostrarlo → ese `scroll`
  cierra el menú en el mismo instante: "no abre" en la última fila visible.
  Que el menú **siga** a su botón y se cierre sólo si el botón sale del área
  visible de su contenedor.
- **Esc a nivel documento mientras está abierto**, no en el `onKeyDown` del menú:
  justo después del clic el foco sigue en el disparador (pasarlo al primer ítem
  espera un frame) y un Esc rápido no llega.

**Lo que NO es una acción y por eso sí va en su columna**: un control de edición
inline de un solo campo (el `<select>` de estado, un toggle de activo). Eso es el
*valor* de la celda, editable en sitio, no una acción del registro. Dale
`aria-label` con el registro ("Estado del pago de 1,200 MXN") y color por estado.
Si necesitas editar dos o más campos, no es inline: es el drawer (§6).

**Al reusar la primitiva del proyecto, revisa qué cubre.** Un `ActionsDropdown`
típico nace para el cuarteto CRUD (editar, eliminar, activar, enviar acceso) con
un prop por acción. En cuanto tu fila necesite otras (duplicar, exportar,
regenerar, entrar), no le sigas agregando props: dale una API genérica de
`items: { label, icon, onSelect, destructiva?, oculta? }[]` una vez, y que todas
las tablas la usen. Y verifica que la primitiva ya traiga las semánticas de menú
de arriba: muchas sólo tienen `title` en el botón y cierre por click-afuera.

---

## 6. Detalle: drawer, no expansión

La expansión inline empuja las filas, mueve la lista bajo el cursor y no deja
claro dónde termina el detalle. Para cualquier detalle rico (tabs, formulario,
contenido largo) usa un **side sheet** con `role="dialog"`, `aria-modal`,
focus-trap, cierre por Esc/backdrop y foco devuelto al disparador.

Dos consecuencias de implementación que muerden:

- **Capas modales.** Si abres un modal DESDE el drawer y el modal tiene z-index
  menor, queda detrás del backdrop. Ordena tus capas y ciérralo antes de abrir el
  otro.
- **El foco vuelve al disparador… si todavía existe.** Si la acción del drawer
  movió la fila (pagarla la manda a otra página con el orden por estado) o la
  borró, el foco cae en `<body>`. Fallback: la región de la tabla.
- **El toast no tapa el pie del drawer.** Encima sí, pero en la esquina
  contraria al drawer: a la derecha cubre sus botones durante segundos.
- **Avisos: Sileo**, con la skill **sileo-avisos**. De fábrica trae `z-index:
  50` (queda bajo el drawer), título en `capitalize`, movimiento reducido que
  no aplica y un Deshacer que desaparece a los 4 s y que con teclado no se
  alcanza a tiempo: once ajustes medidos y un componente listo para copiar.
- **Los toasts van encima de todo.** Un toast lanzado desde un drawer cuyo
  viewport está por debajo del backdrop deja su acción de **Undo inalcanzable**.
  Verifícalo con hit-test (`document.elementFromPoint`), no comparando z-index a
  ojo: puede que tu override no gane por orden de import.

---

## 7. Escala y paginación

- **Paginación, no scroll infinito** en apps de trabajo: hace falta posición
  estable y volver al mismo lugar tras editar. Tamaño de página configurable.
- **Si el listado ya pagina y busca en el SERVIDOR, no lo cambies por un filtro
  de cliente.** Filtrar la página cargada da resultados engañosos: parece una
  búsqueda global y sólo ve 20 registros. Ahí el trabajo correcto es cablear los
  controles de página, no cambiar el componente.
- Antes de convertir, revisa el cliente: si la API acepta `page`/`page_size` y
  devuelve `total`, es servidor. Y comprueba que la UI **pida** otra página: es
  común que muestre "26 registros" y sólo liste los primeros 20, con el resto
  inalcanzable.
- Al cambiar búsqueda o filtro, **regresa a la página 1**.

---

## 7b. Alta: crear uno o cargar muchos

Un botón primario **«+ Nueva <registro>»** arriba a la derecha (uno por vista)
abre un **modal con dos pestañas**: formulario de un registro y carga masiva por
`.xlsx`. Oculto para quien nunca podrá crear; el vacío-primerizo ofrece las dos
entradas. Referencia: `referencia/src/app/CrearFacturas.tsx`.

**Una sola fuente: el esquema de captura, espejo de la tabla.** Tipos,
obligatorios (`NOT NULL`), longitudes (`char_length`), catálogos (`CHECK IN`),
llaves foráneas y reglas entre columnas (`anticipo <= monto`). De ahí salen el
formulario, la plantilla y el validador. Una autoprueba compara el esquema con
el DDL (o con `information_schema`/`pg_constraint`) y **se rompe a propósito
una vez** para ver que suena. Lo que asigna el sistema (id, folio, estado) no
está en el esquema.

**La plantilla (.xlsx) se genera, no se guarda en `public/`**: así trae las listas
vigentes (FK) al momento de bajarla. ExcelJS (SheetJS de npm está viejo, con CVE,
y su versión gratuita no escribe validaciones), importado dinámicamente (~900 KB).
Lleva:
- Encabezados = etiquetas, `*` en obligatorios, fila congelada, formato por tipo.
- Reglas de Excel por rango (`sqref` = `C2:C1001`): listas desde una hoja
  **`veryHidden`** (evita el tope de 255 caracteres), decimal > 0, fechas en
  rango, `textLength`, y `custom` para las reglas entre columnas.
- Hoja «Instrucciones» con cada columna, si es obligatoria, valores y ejemplo.

**Excel valida al escribir, no al pegar: la carga revalida todo** con el mismo
validador (y en producción el servidor también, antes de insertar). El lector acepta
lo que manda Excel de verdad: `Date` a medianoche UTC (leer con `getUTC*`),
seriales, montos con signo de pesos y comas, `dd/mm/aaaa`, etiquetas sin acento o en mayúsculas
(se guarda el valor canónico), texto enriquecido y resultados de fórmula.

**La revisión antes de importar**: «N leídas: X listas, Y con errores», una tabla
fila por fila (número de fila de Excel, columna, valor, problema en lenguaje
llano), **«Importar X válidas y omitir Y»** explícito, y **«Descargar las filas
con errores»**: la misma plantilla con esas filas y una columna «Errores», que
al volver a subirse se ignora. Si el archivo no sirve (no es .xlsx, falta una
columna obligatoria, más del tope de filas, vacío), se dice qué hacer y el
botón queda deshabilitado con su motivo. Tras importar: aviso con Deshacer.

**Formulario**: sin `maxLength` (recorta en silencio lo pegado): contador y
rechazo. Montos en `type=text inputmode=decimal`. `<label htmlFor>`, ayuda y
error enlazados con `aria-describedby`, foco inicial en el primer campo (no en
la ✕) y al primer error al enviar, validación en vivo sólo después del primer
intento. «Crear y agregar otra» limpia y regresa el foco. El clic en el fondo
**no** cierra; Esc/✕ con datos pide confirmar (Esc sobre la confirmación =
seguir editando). El modal va anclado arriba, no centrado: al cambiar de
pestaña cambia la altura y un modal centrado salta.

---

## 8. Verificación (hazla, no la asumas)

Con datos sembrados que cubran los casos raros: cero registros, un registro,
más de una página, `NULL` en las columnas que lo permiten, un valor con un dígito
extra y una etiqueta con acento.

1. **Nada desborda la celda.** Mide, no mires: compara la caja de cada hijo
   contra la de su celda en dos motores y a 1024/1280/1600 px.
2. **Orden numérico.** Ascendente con `180000` y `21150`: si el grande sale
   primero, estás ordenando texto.
3. **Orden de fechas.** Que no sea el orden del texto formateado.
4. **Orden de enums.** Segundo click invierte por severidad, no por nombre.
5. **Búsqueda con lo que se ve.** Teclea la etiqueta con acento y con mayúscula.
6. **Sin resultados** dice "sin resultados", no "sin registros" (son distintos:
   uno se arregla limpiando el filtro).
7. **Paginación** llega a la última página y el contenido cambia de verdad
   (compara la primera celda).
8. **Permisos**: el conteo de botones de una acción restringida coincide con el
   de filas donde la persona sí puede.
9. **Tema oscuro**: los tokens `-soft` suelen ser `rgba(...)` de baja opacidad;
   un relleno translúcido sobre una rejilla se ve rayado y se lee mal.
10. **Pruebas verdes**: los selectores que buscaban `li` ahora son `tr`. Si una
    prueba falla, comprueba en un worktree limpio (`git worktree add`) o con un
    commit WIP si ya fallaba antes de tu cambio —nunca `git stash` desnudo—, y
    dilo.

Recetas ejecutables (Playwright + SQL) en `references/verificacion.md`.

---

## 9. Terminado cuando

- [ ] Una columna por atributo comparable; ningún `·` uniendo datos.
- [ ] `accessor` con el tipo correcto en números, fechas y catálogos.
- [ ] Enums con orden semántico; `NULL` con semántica propia.
- [ ] Números a la derecha, tabulares, con el `th` alineado.
- [ ] Etiquetas traducidas con los mapas del proyecto.
- [ ] Cromo de la tabla en el idioma del producto (contador, paginación, vacío).
- [ ] Sin recortes silenciosos.
- [ ] Acciones en un menú de tres puntos, última columna, encabezado vacío y sin
      orden; con semánticas de menú (aria + teclado + Esc) y destructiva separada.
- [ ] Acciones con Undo/confirm y filtradas por el permiso del servidor.
- [ ] Detalle rico en drawer; toasts por encima de él y sin tapar su pie.
- [ ] Avisos con Sileo y sus ajustes (skill **sileo-avisos**): capa 300, sin
      capitalize, movimiento reducido con `!important`, autopilot ligado a la
      duración, ⌘Z para Deshacer, tonos por tema. Sondas S1–S8 en verde.
- [ ] Cada `<select>`/`<input>` con `<label htmlFor>`: envuelto en su label, el
      nombre accesible arrastra las opciones ("Estado Todos Vencida…").
- [ ] Una acción que no borra (pagar, cancelar) no saca la fila de la selección.
- [ ] Estados: carga (esqueleto de filas), vacío-primerizo con CTA, sin
      resultados con "limpiar", error con reintentar.
- [ ] Alta (§7b) si la tabla es de captura: modal uno/masiva, plantilla generada
      del esquema, revisión fila por fila, archivo de errores re-subible.
- [ ] Verificación §8 corrida, con su evidencia.
- [ ] Pruebas actualizadas y en verde.

---

## Relación con otras skills

- **ux-audit** → auditoría UX de un producto entero. Si el pedido es sólo
  tablas, esta skill (modo auditar) es la que manda; su referencia de tablas
  (`admin-tables.md`, dentro de ux-audit) aporta las heurísticas de producto
  (vistas guardadas, columnas gestionables, densidad) que aquí no se repiten.
  Diferencia deliberada: ahí sugiere "1-2 acciones visibles + resto en ⋯"; la
  regla de la casa es **todas en el ⋯** (§5).
- **sileo-avisos** → la capa de avisos (Deshacer, `sileo.promise`, avisos en
  vivo) con los ajustes que Sileo necesita de fábrica.
- **new-module** (si el proyecto la tiene) → genera el módulo completo; usa esta
  skill para la tabla que ese módulo va a listar.
