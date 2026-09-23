# Verificación de una tabla — recetas ejecutables

Sondas que se corren de verdad. Están escritas para Playwright + una app web con
login, pero la idea traduce a cualquier runner: **medir el DOM y comparar
valores**, no mirar la captura.

Guarda el script en el scratchpad de la sesión (o en un archivo temporal dentro
del proyecto para que resuelva `@playwright/test`) y bórralo al terminar.

---

## 0. Andamio

```js
import { chromium, webkit } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
p.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text().slice(0, 200)))
// … login del proyecto …
await p.goto(URL_DE_LA_TABLA)
await p.waitForTimeout(2500)
```

Un `pageerror` durante la sonda vale más que cualquier aserción: significa que la
página se rompió y lo que ves es el ErrorBoundary.

---

## 1. Nada desborda su celda

Compara la caja de cada descendiente contra la de su celda. Cero salida = bien.

```js
const desbordes = await p.locator('tbody td, thead th').evaluateAll((celdas) =>
  celdas.flatMap((c) => {
    const cb = c.getBoundingClientRect()
    return [...c.querySelectorAll('*')]
      .filter((x) => {
        const b = x.getBoundingClientRect()
        return b.right > cb.right + 0.5 || b.bottom > cb.bottom + 0.5 || b.left < cb.left - 0.5
      })
      .map((x) => `${c.cellIndex}:${x.className}:"${x.textContent.slice(0, 18)}"`)
  }),
)
console.log(desbordes.length ? desbordes.slice(0, 8) : 'sin desborde')
```

Córrelo en **chromium y webkit** y a 1024 / 1280 / 1600 px. El clip con elipsis
necesita `nowrap` + `overflow:hidden` + `min-width: 0` **y un hueco a la derecha**:
sin el hueco, el corte queda contra el borde y se lee como texto desbordado
aunque la medición diga que está dentro.

---

## 2. Orden numérico, no lexicográfico

La prueba decisiva necesita un valor con más dígitos que el resto
(`180000` entre `21150`, `23400`, `41100`).

```js
const col = 4 // 1-based, la columna numérica
const leer = () => p.locator(`tbody tr td:nth-child(${col})`).allInnerTexts()
const th = p.locator(`thead th:nth-child(${col}) button`)
await th.click(); await p.waitForTimeout(300)
console.log('orden 1:', (await leer()).map((t) => t.trim()).join(' | '))
await th.click(); await p.waitForTimeout(300)
console.log('orden 2:', (await leer()).map((t) => t.trim()).join(' | '))
```

Lee el resultado así: en el orden **ascendente**, el valor de más dígitos debe
quedar **al final**. Si queda al principio, el accessor entrega texto.

> Ojo con la dirección: TanStack Table elige la del primer click según el tipo
> del primer valor (`getAutoSortDir`): string → `asc`, número → `desc`. Así que
> en una columna numérica el primer click debe salir **descendente**; si sale
> ascendente, el accessor entrega texto y acabas de encontrar el bug sin
> comparar dígitos. No te fíes de la etiqueta: mira los valores.

---

## 3. Búsqueda sobre lo que se ve

```js
const buscador = p.locator('input[placeholder*="Buscar"]').last() // ¡no el buscador global de la app!
for (const q of ['Cámara', 'camara', 'En uso', 'Alto', 'zzz']) {
  await buscador.fill(q); await p.waitForTimeout(400)
  console.log(`"${q}" → ${await p.locator('tbody tr').count()} filas`)
}
```

- La etiqueta **con acento y mayúscula** (lo que está en pantalla) debe encontrar.
  Si devuelve 0, el accessor entrega el valor crudo de la BD.
- `zzz` debe mostrar el vacío de "sin resultados", distinto del vacío inicial.
- Si el proyecto tiene una paleta de comandos, `input[placeholder*="Buscar"]`
  también la matchea: acota con `.last()` o con el placeholder exacto de la tabla.

---

## 4. Paginación real

```js
const info = p.locator('[class*="pagina"], [class*="pageInfo"]')
const primera = await p.locator('tbody tr td').first().innerText()
await p.getByLabel('Página siguiente').click()
await p.waitForTimeout(1200)
console.log('página 2:', await info.innerText(), '| cambió:', primera !== await p.locator('tbody tr td').first().innerText())
```

Que cambie el contenido, no sólo el número de página. Con paginación de servidor,
revisa además en la pestaña de red que salga otra petición con `page=2`.

---

## 5. Permisos espejados

El conteo de una acción restringida debe igualar el de filas donde la persona
puede. Córrelo con **dos** usuarios de distinto rol.

```js
const propias = await p.locator('tbody tr').filter({ hasText: 'Tú' }).count()
const botones = await p.locator('tbody tr button[title="Cerrar sala"]').count()
console.log({ propias, botones, ok: propias === botones })
```

Para un admin con permiso global, el conteo debe ser el total de filas.

---

## 5b. El menú de acciones

La regla es una columna final con un botón de tres puntos. Compruébalo, incluido
el teclado, que es lo que más se olvida.

```js
// 1. Existe uno por fila y es la última columna
const filas = await p.locator('tbody tr').count()
const kebabs = await p.locator('tbody tr td:last-child button').count()
console.log({ filas, kebabs, ok: filas === kebabs })

// 2. No quedan botones de acción sueltos en otras celdas
const sueltos = await p.locator('tbody tr td:not(:last-child) button').count()
console.log('botones fuera del menú (debe ser 0, salvo editores inline):', sueltos)

// 3. Semánticas del disparador
console.log(await p.locator('tbody tr td:last-child button').first().evaluate((b) => ({
  nombre: b.getAttribute('aria-label') || b.title,
  haspopup: b.getAttribute('aria-haspopup'),
  expanded: b.getAttribute('aria-expanded'),
})))

// 4. Teclado: abre, Esc cierra y devuelve el foco
const trigger = p.locator('tbody tr td:last-child button').first()
await trigger.focus()
await p.keyboard.press('Enter')
console.log('abre con Enter:', await p.locator('[role="menu"]').count() > 0)
await p.keyboard.press('Escape')
console.log('Esc cierra:', await p.locator('[role="menu"]').count() === 0,
  '| foco devuelto:', await trigger.evaluate((b) => b === document.activeElement))

// 5. Abrir el menú no abre el detalle de la fila (stopPropagation)
await trigger.click()
console.log('no abrió el drawer:', await p.locator('[role="dialog"]').count() === 0)
```

Y con la última fila visible: el menú debe abrir **hacia arriba** si no hay
espacio abajo, no quedar cortado por el borde de la ventana.

---

## 5c. Permisos: la sonda también puede mentir

Si la regla depende del estado de la fila (pagada no se cancela), corre el conteo
sobre una página con **todos** los estados. Con el orden por defecto
"vencidas primero", las 25 filas eran vencidas: esperado 25 = real 25 y la regla
por estado nunca se probó. Ordena por folio o filtra para mezclar, e imprime la
mezcla como parte de la evidencia.

## 5d. CSV real

Descarga de verdad (`page.waitForEvent('download')`) y lee el archivo: BOM,
filas = conteo filtrado, montos como número, etiquetas (no códigos). Neutraliza
fórmulas (`= + - @ \t \r` al inicio → prefijo `'`) **excepto números puros**:
`-500` prefijado se vuelve texto en Excel. Deja una autoprueba del escape con
entradas hostiles.

## 6. Tema oscuro

```js
const p2 = await b.newPage({ colorScheme: 'dark' })
// … login + goto …
```

Lo que falla aquí casi siempre es un relleno translúcido: los tokens `-soft`
suelen ser `rgba(color, 0.16)` en oscuro, así que una rejilla o un patrón detrás
se transparenta y el bloque se ve rayado. Solución: color de fondo **opaco** y el
tinte como `background-image: linear-gradient(<soft>, <soft>)` encima.

---

## 7. Toasts y capas modales

Con Sileo, las 8 sondas específicas (capa, texto, teclado, lector, movimiento,
contraste, vida del botón, promesa) están en la skill **sileo-avisos**. El
selector del aviso es `[data-sileo-toast]`, el del botón `[data-sileo-button]`
(un `<a>`: `getByRole('link')`), y hay que esperar ~150 ms a que se expanda
antes del hit-test.

Un toast lanzado desde un drawer debe quedar **encima** y ser clicable. El
z-index computado no alcanza como prueba: haz hit-test.

```js
const clicable = await p.evaluate(() => {
  const t = document.querySelector('[data-toast] button, [class*="toast"] button')
  if (!t) return 'sin botón en el toast'
  const r = t.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return t.contains(top) || top === t ? 'clicable ✓' : `tapado por ${top?.className || top?.tagName}`
})
```

Si tu override de z-index no gana, revisa el **orden de imports** de las hojas de
estilo antes de subir el número: puede que la librería se importe después que tu
archivo, y entonces hace falta más especificidad, no más z-index.

---

## 8. Datos de prueba

Siembra en local lo que la tabla tiene que aguantar, y **dilo** al entregar
(quedan en la BD de quien te lea):

- cero registros y exactamente uno (los vacíos y el singular del contador),
- más de una página,
- `NULL` en cada columna que lo permita,
- un valor numérico con un dígito extra,
- una etiqueta con acento,
- un registro por cada estado del enum, incluido el que "no ocupa"
  (una cancelación, una baja) — ese suele revelar que el conteo miente.

Respeta los `CHECK` del schema: si la migración limita `motivo` o `tipo` a una
lista, lee la restricción antes de inventar valores.

```sql
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'mi_tabla'::regclass AND contype = 'c';
```

Deja constancia de cómo se limpia (`db:reset` + reseed) y limpia tu propio
residuo: si una sonda dejó un valor de prueba en un campo real, bórralo.

---

## 9. Trampas de la propia sonda

Cobradas auditando un proyecto real. Todas hicieron que la sonda mintiera, en
un sentido o en el otro:

- **`innerText` incluye el texto «sólo lector»** (clip de 1px): un encabezado
  de ⋯ correcto parece tener texto. Mide lo visible (caja > 2px).
- **El `textContent` de una fila pega las celdas** («Sin módulos**Activo**»): un
  `/\bActivo\b/` sobre la fila nunca coincide. Cuenta por celda.
- **`text-transform: uppercase`**: el encabezado es «SESSION ID» en `innerText`.
  Los detectores de idioma, sin distinguir mayúsculas.
- **«Sí/No» también es español**: no lo metas en la lista de palabras en inglés.
- **Tabla vacía**: ahí «No hay registros» es lo correcto; T4/T9 son `n.a.`, no ✗.
- **Una fila sin acciones permitidas no lleva menú** (filtrar, no deshabilitar):
  `kebabs ≤ filas`. Pero sin menú y CON botones en la última columna = ✗.
- **«Actualizar» no prueba el reinicio de página**: React Query conserva la
  referencia si los datos no cambiaron. El reinicio muerde con un Deshacer.

**Valida la sonda contra el código viejo.** Si corregiste un detector después de
ver un fallo, córrela sobre `main` (un `git worktree` servido en el mismo
puerto, que es el que el backend acepta por CORS): tiene que marcar lo que
marcaba antes. Una sonda que sólo se ha visto pasar no prueba nada.

## 10. TanStack v8 (proyectos existentes)

- **La búsqueda global deja fuera columnas** cuyo primer valor no es texto o
  número (**booleanos**: «Activo» nunca se encuentra) y las columnas sin
  accessor. `getColumnCanGlobalFilter` explícito + un `globalFilterFn` que lea
  `meta.buscar` o el accessor, normalizado sin acentos.
- **`autoResetPageIndex` no reinicia en el PRIMER cambio de datos**, sólo lo
  «registra»; en la app ese primero es la carga y el reinicio muerde en el
  segundo (un Deshacer). La prueba unitaria debe reproducir `[] → datos →
  cambio` y vaciar la microtarea (`await act(async () => {})`): con un solo
  rerender pasaba con el bug puesto.
- **El accessor se cachea POR FILA hasta que cambia `data`**, no cuando cambian
  las columnas. Una columna que lee un mapa cargado aparte (nombre del vendedor,
  del área) se queda con «—» si el mapa llega después que los datos. En las
  tablas donde el mapa ya estaba en caché no se ve: mide con la página recién
  abierta. Arreglo en la primitiva: `useMemo(() => data.slice(), [data, columnas])`.

## 11. El dato que nunca llega

- **Una columna con el MISMO valor en todas las filas** («—», «Pendiente») es
  una pista: confirma que el campo existe en la tabla (`\d tabla`). Un tipo del
  frontend puede declarar columnas que ninguna migración crea, y la pantalla
  muestra «Duración: —» para siempre.
- **React Query con `initialData: []` y `staleTime`**: la lista vacía cuenta como
  fresca y la consulta no sale durante `staleTime`. Los catálogos (nombres de
  estado, etiquetas) no llegan y la tabla muestra la clave cruda. Va en
  `placeholderData`. Se ve en la pestaña de red: la petición no existe.
- **Tabla vacía en la base de prueba**: siembra filas PROPIAS marcadas (un
  valor que nada más use, borrado al final por esa marca) en vez de dar sus
  checks por `n.a.` — ahí se escondían los dos casos de arriba.

## 12. Carga masiva: lo que se escapa

- **La plantilla se genera con las opciones que el formulario tiene EN ESE
  MOMENTO.** Si una lista obligatoria (vendedores) se pide al abrir el modal, un
  clic rápido baja una plantilla sin desplegable y la carga rechaza todas las
  filas. Deshabilita «Descargar» y la subida hasta que la lista llegue.
- **Una lista obligatoria que nunca llega** es un defecto aguas arriba: aquí el
  endpoint filtraba por el NOMBRE del rol («vendedor», que no existe) y crear
  una sesión era imposible también desde el formulario.
- **Vacío ≠ null.** Mandar `null` rompe las columnas NOT NULL con default
  (`estado DEFAULT 'active'`). Omite la columna y deja que la base aplique su default.
- **Coteja la plantilla contra la base, no contra el código**: obligatorios de la
  plantilla (`*`) = columnas NOT NULL sin default (`information_schema`). Así
  salió un `ruta` NOT NULL que el formulario dejaba opcional.
- **Un lote en una sola sentencia es todo o nada**: si la base rechaza una fila,
  reintenta una por una para decir cuál y por qué.
- **Acciones irreversibles** (invitaciones que mandan correo): sin Deshacer, con
  el verbo en el botón después de revisar («Enviar 12 invitaciones»). Y nunca
  contraseñas en una plantilla de Excel.
