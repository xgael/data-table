// Sondas del modo AUDITAR (data-table/references/auditoria.md) sobre la tabla de facturas.
// Uso: node .sondas/auditar.mjs   (servidor en :3022)
import { chromium, webkit } from '@playwright/test'

const URL = 'http://localhost:3022/'
const R = {}
const ok = (id, pasa, evidencia) => {
  R[id] = { pasa, evidencia }
  console.log(`${pasa ? '✓' : '✗'} ${id} — ${typeof evidencia === 'string' ? evidencia : JSON.stringify(evidencia)}`)
}
const errores = []

async function abrir(b, qs = '', opts = {}) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, ...opts })
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)))
  await p.goto(URL + qs)
  await p.waitForSelector('tbody button[data-folio], tbody td[colspan]', { timeout: 15000 })
  return p
}
const colIdx = async (p, nombre) =>
  (await p.locator('thead th').allInnerTexts()).findIndex((t) => t.replace(/[↑↓↕]/g, '').trim() === nombre) + 1
const leerCol = async (p, n) => (await p.locator(`tbody tr td:nth-child(${n})`).allInnerTexts()).map((t) => t.trim())
const ordenarPor = async (p, nombre) => {
  await p.locator('thead th button', { hasText: nombre }).click()
  await p.waitForTimeout(150)
}
const num = (t) => Number(t.replace(/[^0-9.-]/g, ''))

const b = await chromium.launch()

// ── T2a orden numérico (+ delator del primer click)
{
  const p = await abrir(b, '?tam=100')
  const n = await colIdx(p, 'Monto')
  await ordenarPor(p, 'Monto')
  const clic1 = await leerCol(p, n)
  const primeroDesc = num(clic1[0]) >= num(clic1[1])
  await ordenarPor(p, 'Monto')
  const asc = (await leerCol(p, n)).map(num)
  // En la página 1 asc no está 180000; vamos a la última página y leemos el final.
  await p.getByLabel('Última página').click()
  await p.waitForTimeout(150)
  const ultimos = (await leerCol(p, n)).map(num)
  const creciente = asc.every((v, i) => i === 0 || v >= asc[i - 1])
  ok('T2a', primeroDesc && creciente && ultimos.at(-1) === 180000, {
    primerClicDesc: primeroDesc, ascCreciente: creciente, ultimoAsc: ultimos.at(-1),
  })
  await p.close()
}

// ── T2b fechas por instante (no por texto "03 may" < "18 jun")
{
  const p = await abrir(b, '?tam=100&orden=emision')
  const n = await colIdx(p, 'Emisión')
  const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sept: 8, sep: 8, oct: 9, nov: 10, dic: 11 }
  const t = (await leerCol(p, n)).map((s) => {
    const [d, m, y] = s.split(' ')
    return Date.UTC(+y, MES[m], +d)
  })
  const creciente = t.every((v, i) => i === 0 || v >= t[i - 1])
  const textoOrdenado = [...(await leerCol(p, n))].sort().join() === (await leerCol(p, n)).join()
  ok('T2b', creciente && !textoOrdenado, { cronologico: creciente, coincideConOrdenDeTexto: textoOrdenado })
  await p.close()
}

// ── T2c enum por rango + NULL al final en ambas direcciones
{
  const p = await abrir(b, '?tam=100&orden=estado')
  const n = await colIdx(p, 'Estado')
  const RANK = { Vencida: 0, Pendiente: 1, Pagada: 2, Cancelada: 3 }
  const asc = (await leerCol(p, n)).map((s) => RANK[s])
  const rango = asc.every((v, i) => i === 0 || v >= asc[i - 1])
  await p.close()
  const q = await abrir(b, '?tam=100&orden=anticipo')
  const na = await colIdx(q, 'Anticipo')
  const leerTodo = async () => {
    const out = []
    for (;;) {
      out.push(...(await leerCol(q, na)))
      if (await q.getByLabel('Página siguiente').isDisabled()) break
      await q.getByLabel('Página siguiente').click()
      await q.waitForTimeout(100)
    }
    return out
  }
  const a = await leerTodo()
  const nulosAlFinalAsc = a.findIndex((s) => s === 'Sin anticipo') > 0 && a.slice(a.findIndex((s) => s === 'Sin anticipo')).every((s) => s === 'Sin anticipo')
  await q.goto(URL + '?tam=100&orden=-anticipo')
  await q.waitForSelector('tbody button[data-folio]')
  const d = await leerTodo()
  const nulosAlFinalDesc = d.slice(d.findIndex((s) => s === 'Sin anticipo')).every((s) => s === 'Sin anticipo')
  ok('T2c', rango && nulosAlFinalAsc && nulosAlFinalDesc, { enumPorRango: rango, nuloFinalAsc: nulosAlFinalAsc, nuloFinalDesc: nulosAlFinalDesc, nulos: a.filter((s) => s === 'Sin anticipo').length })
  await q.close()
}

// ── T2d orden por defecto = la tarea (vencidas primero, la que venció antes arriba)
{
  const p = await abrir(b)
  const est = await leerCol(p, await colIdx(p, 'Estado'))
  const ariaSort = await p.locator('thead th[aria-sort]').evaluateAll((ths) => ths.map((t) => `${t.innerText.replace(/[↑↓↕]/g, '').trim()}=${t.getAttribute('aria-sort')}`))
  ok('T2d', est[0] === 'Vencida', { primeraFila: est[0], ariaSort })
  await p.close()
}

// ── T3 búsqueda por lo que se ve + T4 conteo y regreso a página 1
{
  const p = await abrir(b, '?pagina=3')
  const buscador = p.getByPlaceholder('Buscar folio, cliente, categoría, estado…')
  const res = {}
  for (const q of ['Cámara', 'camara', 'CÁMARA', 'ñandu', 'Vencida', 'zzz']) {
    await buscador.fill(q)
    await p.waitForTimeout(200)
    res[q] = { conteo: await p.locator('h1 + p').innerText(), pagina: await p.locator('[data-pagina]').innerText() }
  }
  const vacio = await p.locator('tbody td[colspan]').innerText().catch(() => '')
  const cam = res['Cámara'].conteo
  ok('T3', cam === res['camara'].conteo && cam === res['CÁMARA'].conteo && !cam.startsWith('0') && !res['ñandu'].conteo.startsWith('0'), res)
  ok('T4', res['Cámara'].pagina.startsWith('Página 1') && /Sin resultados/.test(vacio) && !/Todavía no hay/.test(vacio), {
    paginaTrasBuscar: res['Cámara'].pagina, vacioZzz: vacio.split('\n')[0],
  })
  // chips
  await buscador.fill('')
  await p.getByLabel('Estado', { exact: true }).selectOption('Pagada')
  await p.getByLabel('Categoría', { exact: true }).selectOption('Diseño')
  const chips = await p.locator('[aria-label="Filtros activos"] button').allInnerTexts()
  R.T4.evidencia.chips = chips
  await p.getByRole('button', { name: 'Limpiar todo' }).click()
  R.T4.evidencia.trasLimpiar = await p.locator('h1 + p').innerText()
  console.log('   chips:', chips, '→', R.T4.evidencia.trasLimpiar)
  await p.close()
}

// ── T5a números a la derecha, tabulares, th alineado
{
  const p = await abrir(b)
  const n = await colIdx(p, 'Monto')
  const est = await p.evaluate((n) => {
    const td = document.querySelector(`tbody tr td:nth-child(${n})`)
    const th = document.querySelector(`thead th:nth-child(${n})`)
    const s = (e) => getComputedStyle(e)
    const bd = td.getBoundingClientRect(), bh = th.querySelector('button').getBoundingClientRect()
    return { td: s(td).textAlign, th: s(th).textAlign, nums: s(td).fontVariantNumeric, bordeDerechoIgual: Math.abs(td.getBoundingClientRect().right - th.getBoundingClientRect().right) < 1, textoTdFinal: Math.round(bd.right), botonThFinal: Math.round(bh.right) }
  }, n)
  ok('T5a', est.td === 'end' && est.th === 'end' && est.nums.includes('tabular-nums'), est)
  await p.close()
}

// ── T5b sin códigos crudos en pantalla
{
  const p = await abrir(b, '?tam=100')
  const txt = await p.locator('tbody').innerText()
  const crudos = ['camara', 'publicacion', 'diseno', 'consultoria', 'vencida', 'pendiente', 'fac_'].filter((c) => new RegExp(`\\b${c}`).test(txt))
  ok('T5b', crudos.length === 0, { crudosEncontrados: crudos })
  await p.close()
}

// ── T5c nada desborda la celda (chromium + webkit × 3 anchos)
{
  const res = {}
  const w = await webkit.launch()
  for (const [nombre, motor] of [['chromium', b], ['webkit', w]]) {
    for (const ancho of [1024, 1280, 1600]) {
      const p = await abrir(motor, '', { viewport: { width: ancho, height: 900 } })
      const d = await p.locator('tbody td, thead th').evaluateAll((celdas) =>
        celdas.flatMap((c) => {
          const cb = c.getBoundingClientRect()
          return [...c.querySelectorAll('*')].filter((x) => {
            const r = x.getBoundingClientRect()
            return r.width && (r.right > cb.right + 0.5 || r.bottom > cb.bottom + 0.5 || r.left < cb.left - 0.5)
          }).map((x) => `${c.cellIndex}:${x.tagName}:${x.textContent.slice(0, 16)}`)
        }),
      )
      res[`${nombre}@${ancho}`] = d.length ? d.slice(0, 3) : 0
      await p.close()
    }
  }
  await w.close()
  ok('T5c', Object.values(res).every((v) => v === 0), res)
}

// ── T6 menú ⋯
{
  const p = await abrir(b)
  const filas = await p.locator('tbody tr').count()
  const kebabs = await p.locator('tbody tr td:last-child button[aria-haspopup="menu"]').count()
  const sueltos = await p.locator('tbody tr td:not(:last-child) button:not([data-folio])').count()
  const thVacio = (await p.locator('thead th:last-child').innerText()).trim()
  const trig = p.locator('tbody tr td:last-child button').first()
  const sem = await trig.evaluate((b) => ({ nombre: b.getAttribute('aria-label'), haspopup: b.getAttribute('aria-haspopup'), expanded: b.getAttribute('aria-expanded') }))
  ok('T6a', filas === kebabs && sueltos === 0 && thVacio === 'Acciones', { filas, kebabs, botonesFueraDelMenu: sueltos, encabezadoVisible: thVacio === 'Acciones' ? '(sr-only)' : thVacio })

  await trig.focus()
  await p.keyboard.press('Enter')
  await p.waitForTimeout(100)
  const abre = (await p.locator('[role="menu"]').count()) === 1
  const focoEnPrimero = await p.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem')
  await p.keyboard.press('ArrowDown')
  const segundo = await p.evaluate(() => document.activeElement?.textContent)
  await p.keyboard.press('End')
  const ultimo = await p.evaluate(() => document.activeElement?.textContent)
  const separado = await p.locator('[role="menu"] [role="separator"] + button, [role="menu"] div:has([role="separator"]) button').last().innerText().catch(() => '')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(50)
  const cierra = (await p.locator('[role="menu"]').count()) === 0
  const focoDevuelto = await trig.evaluate((b) => b === document.activeElement)
  await trig.click()
  const noAbrioDrawer = (await p.locator('[role="dialog"]').count()) === 0
  await p.keyboard.press('Escape')
  ok('T6b', abre && focoEnPrimero && cierra && focoDevuelto && noAbrioDrawer && sem.expanded === 'false', {
    ...sem, abreConEnter: abre, focoEnPrimero, flechaAbajo: segundo, end: ultimo, escCierra: cierra, focoDevuelto, clicNoAbreDetalle: noAbrioDrawer,
  })

  // abre hacia arriba en la última fila visible
  await p.locator('[class*="scroll"]').evaluate((e) => (e.scrollTop = e.scrollHeight))
  const ult = p.locator('tbody tr td:last-child button').last()
  await ult.click()
  const cajas = await p.evaluate(() => {
    const m = document.querySelector('[role="menu"]').getBoundingClientRect()
    return { menuArriba: Math.round(m.top), menuAbajo: Math.round(m.bottom), ventana: innerHeight }
  })
  const btn = await ult.boundingBox()
  R.T6b.evidencia.ultimaFila = { ...cajas, abreHaciaArriba: cajas.menuAbajo <= btn.y + 1, dentroDeVentana: cajas.menuAbajo <= cajas.ventana }
  console.log('   última fila:', R.T6b.evidencia.ultimaFila)
  if (!R.T6b.evidencia.ultimaFila.dentroDeVentana) R.T6b.pasa = false
  await p.keyboard.press('Escape')

  // T6c destructiva al final + Deshacer restaura
  const antes = await p.locator('h1 + p').innerText()
  await p.locator('[class*="scroll"]').evaluate((e) => (e.scrollTop = 0))
  const folio = await p.locator('tbody tr').first().locator('button[data-folio]').innerText()
  await p.locator('tbody tr').first().locator('td:last-child button').click()
  const items = await p.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
  await p.getByRole('menuitem', { name: 'Eliminar' }).click()
  await p.waitForTimeout(100)
  const trasBorrar = await p.locator('h1 + p').innerText()
  const sigueVisible = await p.locator('tbody button[data-folio]', { hasText: folio }).count()
  await p.getByRole('link', { name: 'Deshacer' }).click()
  await p.waitForTimeout(100)
  const trasDeshacer = await p.locator('h1 + p').innerText()
  const volvio = await p.locator('tbody button[data-folio]', { hasText: folio }).count()
  ok('T6c', items.at(-1) === 'Eliminar' && trasBorrar !== antes && sigueVisible === 0 && trasDeshacer === antes && volvio === 1, {
    items, antes, trasBorrar, trasDeshacer, filaRegreso: volvio === 1,
  })
  await p.close()
}

// ── T7 drawer + toast clicable encima + foco de regreso
{
  const p = await abrir(b)
  const folioBtn = p.locator('tbody button[data-folio]').first()
  const id = await folioBtn.getAttribute('data-folio')
  await folioBtn.focus()
  await p.keyboard.press('Enter')
  await p.waitForSelector('[role="dialog"]')
  const d = await p.evaluate(() => {
    const dl = document.querySelector('[role="dialog"]')
    return { modal: dl.getAttribute('aria-modal'), titulo: document.getElementById(dl.getAttribute('aria-labelledby'))?.textContent, focoDentro: dl.contains(document.activeElement) }
  })
  let escapo = false
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('Tab')
    if (!(await p.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)))) escapo = true
  }
  await p.locator('[role="dialog"] footer button', { hasText: 'Copiar folio' }).click()
  await p.waitForTimeout(100)
  const hit = await p.evaluate(() => {
    const t = document.querySelector('[data-sileo-button], [data-sileo-toast]')
    if (!t) return 'sin toast'
    const r = t.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return t.contains(top) || top === t ? 'clicable' : `tapado por ${top?.className || top?.tagName}`
  })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(100)
  const cerrado = (await p.locator('[role="dialog"]').count()) === 0
  const focoMismoFolio = await p.evaluate((id) => document.activeElement?.getAttribute('data-folio') === id, id)

  // (b) pagar desde el drawer: la vencida pasa a pagada y sale de la página 1
  await p.locator(`tbody button[data-folio="${id}"]`).click()
  await p.locator('[role="dialog"] footer button', { hasText: 'Registrar pago' }).click()
  await p.waitForSelector('[data-sileo-button]', { state: 'visible' }) // Sileo expande a los 150 ms
  await p.waitForTimeout(700)
  const hitPago = await p.evaluate(() => {
    const t = [...document.querySelectorAll('[data-sileo-button]')].find((x) => x.textContent === 'Deshacer')
    if (!t) return 'sin Deshacer'
    const r = t.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return t.contains(top) || top === t ? 'clicable' : `tapado por ${top?.className || top?.tagName}`
  })
  // con el toast visible, ningún botón del pie del drawer queda tapado
  const pieTapado = await p.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] footer button')].filter((x) => {
      const r = x.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !(x === top || x.contains(top))
    }).map((x) => x.textContent),
  )
  await p.keyboard.press('Escape')
  await p.waitForTimeout(100)
  const filaSigueEnPagina = await p.locator(`tbody button[data-folio="${id}"]`).count()
  const focoTrasPago = await p.evaluate(() => document.activeElement?.getAttribute('data-folio') ?? document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName)

  await p.locator('tbody tr').nth(1).locator('td').nth(2).click()
  const filaAbre = (await p.locator('[role="dialog"]').count()) === 1
  const okFocoPago = filaSigueEnPagina ? focoTrasPago === id : focoTrasPago === 'region'
  ok('T7', d.modal === 'true' && d.focoDentro && !escapo && hit === 'clicable' && hitPago === 'clicable' && pieTapado.length === 0 && cerrado && focoMismoFolio && okFocoPago && filaAbre, {
    ...d, trapSinFuga: !escapo, toastSobreDrawer: hit, deshacerSobreDrawer: hitPago, pieDelDrawerTapado: pieTapado, escCierra: cerrado, focoRegresaAlFolio: focoMismoFolio,
    trasPagar: { filaSigueEnPagina: !!filaSigueEnPagina, foco: focoTrasPago }, clicEnFilaAbre: filaAbre,
  })
  await p.close()
}

// ── T8a sin recorte: la suma de filas de todas las páginas = contador
// ── T8b paginación cambia contenido
// ── T8c estado sobrevive recarga y Atrás no recarga
{
  const p = await abrir(b)
  let suma = 0
  const primeras = new Set()
  for (;;) {
    suma += await p.locator('tbody tr').count()
    primeras.add(await p.locator('tbody button[data-folio]').first().innerText())
    if (await p.getByLabel('Página siguiente').isDisabled()) break
    await p.getByLabel('Página siguiente').click()
    await p.waitForTimeout(80)
  }
  const total = num(await p.locator('h1 + p').innerText())
  ok('T8a', suma === total, { filasRecorridas: suma, contador: total })
  ok('T8b', primeras.size === Math.ceil(total / 25), { paginas: Math.ceil(total / 25), primerasCeldasDistintas: primeras.size, ultima: await p.locator('[data-pagina]').innerText() })

  await p.getByPlaceholder('Buscar folio, cliente, categoría, estado…').fill('óptica')
  await p.getByLabel('Estado', { exact: true }).selectOption('Pagada')
  await ordenarPor(p, 'Monto')
  const url = p.url()
  const antes = { conteo: await p.locator('h1 + p').innerText(), primera: await p.locator('tbody button[data-folio]').first().innerText() }
  await p.reload()
  await p.waitForSelector('tbody button[data-folio]')
  const despues = { conteo: await p.locator('h1 + p').innerText(), primera: await p.locator('tbody button[data-folio]').first().innerText(), buscador: await p.getByPlaceholder('Buscar folio, cliente, categoría, estado…').inputValue() }
  // Atrás: sale de la app sin recargar la página actual primero (replaceState no apila)
  await p.evaluate(() => (window.__marca = 1))
  const nav = await p.evaluate(() => performance.getEntriesByType('navigation')[0]?.type)
  ok('T8c', antes.conteo === despues.conteo && antes.primera === despues.primera && despues.buscador === 'óptica', { url: decodeURIComponent(url.replace(URL, '/')), antes, despues, tipoNavegacion: nav })
  await p.close()

  // historial: filtrar no apila entradas; y un pushState de otra página + Atrás no recarga
  const h = await abrir(b)
  const len0 = await h.evaluate(() => history.length)
  await h.getByPlaceholder('Buscar folio, cliente, categoría, estado…').fill('hotel')
  await h.getByLabel('Estado', { exact: true }).selectOption('Vencida')
  const len1 = await h.evaluate(() => history.length)
  await h.evaluate(() => (window.__marca = 'viva'))
  await h.goto('about:blank')
  await h.goBack()
  await h.waitForSelector('tbody button[data-folio], tbody td[colspan]')
  const trasAtras = { conteo: await h.locator('h1 + p').innerText(), buscador: await h.getByPlaceholder('Buscar folio, cliente, categoría, estado…').inputValue() }
  R.T8c.evidencia.historial = { entradasAntes: len0, entradasDespuesDeFiltrar: len1, trasSalirYVolver: trasAtras }
  console.log('   historial:', R.T8c.evidencia.historial)
  if (len1 !== len0 || trasAtras.buscador !== 'hotel') R.T8c.pasa = false
  await h.close()
}

// ── T9 estados
{
  const res = {}
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  p.on('pageerror', (e) => errores.push(e.message))
  await p.goto(URL + '?demo=lento')
  await p.waitForTimeout(400)
  res.carga = { esqueleto: await p.locator('tbody tr[aria-hidden="true"]').count(), ariaBusy: await p.locator('table').getAttribute('aria-busy') }
  const altoCarga = await p.locator('[class*="scroll"]').evaluate((e) => e.getBoundingClientRect().height)
  await p.waitForSelector('tbody button[data-folio]', { timeout: 8000 })
  const altoDatos = await p.locator('[class*="scroll"]').evaluate((e) => e.getBoundingClientRect().height)
  res.sinSalto = altoCarga === altoDatos
  await p.goto(URL + '?demo=vacio')
  await p.waitForSelector('tbody td[colspan]')
  res.vacio = (await p.locator('tbody td[colspan]').innerText()).split('\n')
  await p.goto(URL + '?demo=error')
  await p.waitForSelector('tbody td[colspan]')
  res.error = (await p.locator('tbody td[colspan]').innerText()).split('\n')
  await p.getByRole('button', { name: 'Reintentar' }).click()
  await p.waitForSelector('tbody button[data-folio]', { timeout: 8000 })
  res.reintentarCarga = await p.locator('h1 + p').innerText()
  ok('T9', res.carga.esqueleto === 10 && res.carga.ariaBusy === 'true' && res.sinSalto && res.vacio[0] === 'Todavía no hay facturas' && /No se pudieron/.test(res.error[0]) && res.reintentarCarga === '137 facturas', res)
  await p.close()
}

// ── T10 selección masiva con alcance
{
  const p = await abrir(b, '?estado=Pendiente')
  const filtradas = Number((await p.locator('h1 + p').innerText()).match(/\d+/)[0])
  await p.getByLabel('Seleccionar todas las filas de esta página').check()
  const barra1 = await p.locator('[class*="seleccion"]').innerText()
  const oferta = await p.getByRole('button', { name: /Seleccionar las \d+ que coinciden/ }).count()
  if (oferta) await p.getByRole('button', { name: /Seleccionar las \d+ que coinciden/ }).click()
  const barra2 = await p.locator('[class*="seleccion"]').innerText()
  // indeterminado con una sola fila marcada
  await p.getByRole('button', { name: 'Quitar selección' }).click()
  await p.locator('tbody input[type=checkbox]').first().check()
  const indet = await p.getByLabel('Seleccionar todas las filas de esta página').evaluate((e) => e.indeterminate)
  // shift-rango
  await p.locator('tbody input[type=checkbox]').nth(4).click({ modifiers: ['Shift'] })
  const rango = (await p.locator('[class*="seleccion"] strong').innerText())
  // pagar desde la barra no deselecciona (sólo borrar saca de la selección)
  await p.getByRole('button', { name: /^Registrar pago/ }).click()
  await p.waitForTimeout(100)
  const trasPagar = await p.locator('[class*="seleccion"] strong').innerText().catch(() => 'sin barra')
  await p.getByRole('link', { name: 'Deshacer' }).first().click()
  ok('T10', /^25 seleccionadas/.test(barra1) && (filtradas <= 25 || oferta === 1) && barra2.startsWith(`${filtradas} seleccionadas`) && indet && rango === '5 seleccionadas' && trasPagar === '5 seleccionadas', {
    filtradas, barraPagina: barra1.split('\n')[0], ofreceSeleccionarTodas: oferta === 1, barraTodas: barra2.split('\n')[0], indeterminadoCon1: indet, shiftRango1a5: rango, trasPagarSigueSeleccion: trasPagar,
  })
  await p.close()
}

// ── T11 permisos: conteo de opciones = filas donde la regla lo permite
{
  const res = {}
  for (const rol of ['admin', 'cobranza', 'consulta']) {
    // orden=folio mezcla estados en la página: si no, las 25 son vencidas y la regla por estado no se prueba
    const p = await abrir(b, rol === 'admin' ? '?orden=folio' : `?orden=folio&rol=${rol}`)
    const estados = await leerCol(p, await colIdx(p, 'Estado'))
    const esperado = {
      pago: rol === 'consulta' ? 0 : estados.filter((e) => e === 'Vencida' || e === 'Pendiente').length,
      cancelar: rol === 'admin' ? estados.filter((e) => e !== 'Pagada' && e !== 'Cancelada').length : 0,
      eliminar: rol === 'admin' ? estados.filter((e) => e !== 'Pagada').length : 0,
    }
    const real = { pago: 0, cancelar: 0, eliminar: 0 }
    const n = await p.locator('tbody tr').count()
    for (let i = 0; i < n; i++) {
      await p.locator('tbody tr').nth(i).locator('td:last-child button').click()
      const its = await p.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
      real.pago += its.includes('Registrar pago')
      real.cancelar += its.includes('Cancelar factura')
      real.eliminar += its.includes('Eliminar')
      await p.keyboard.press('Escape')
    }
    res[rol] = { mezcla: [...new Set(estados)], esperado, real, igual: JSON.stringify(esperado) === JSON.stringify(real) }
    await p.close()
  }
  ok('T11', Object.values(res).every((r) => r.igual), res)
}

// ── CSV real: descarga, BOM, filas = filtradas, número como número, acentos
{
  const p = await abrir(b, '?estado=Pagada')
  const filtradas = Number((await p.locator('h1 + p').innerText()).match(/\d+/)[0])
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /^Exportar/ }).click()])
  const buf = await (await import('node:fs/promises')).readFile(await dl.path())
  const txt = buf.toString('utf8')
  const lineas = txt.replace(/^\uFEFF/, '').split('\r\n')
  const cab = lineas[0].split(',')
  const iMonto = cab.indexOf('Monto')
  const montosNumericos = lineas.slice(1).every((l) => /^\d+(\.\d+)?$/.test(l.split(',')[iMonto]))
  const estadosCsv = new Set(lineas.slice(1).map((l) => l.split(',')[cab.indexOf('Estado')]))
  ok('CSV', txt.charCodeAt(0) === 0xfeff && lineas.length - 1 === filtradas && montosNumericos && estadosCsv.size === 1 && estadosCsv.has('Pagada') && cab.includes('Categoría'), {
    archivo: dl.suggestedFilename(), bom: txt.charCodeAt(0) === 0xfeff, filas: lineas.length - 1, filtradas, cabecera: cab, montosNumericos, estados: [...estadosCsv], ejemplo: lineas[1],
  })
  await p.close()
}

// ── T12 a11y + oscuro + 360px
{
  const p = await abrir(b)
  const a = await p.evaluate(() => ({
    caption: document.querySelector('table caption')?.textContent,
    thScope: [...document.querySelectorAll('thead th')].every((t) => t.getAttribute('scope') === 'col'),
    regionEnfocable: document.querySelector('[role="region"]')?.getAttribute('tabindex'),
    checkboxConNombre: [...document.querySelectorAll('tbody input[type=checkbox]')].every((c) => c.getAttribute('aria-label')),
  }))
  await p.close()
  const o = await abrir(b, '', { colorScheme: 'dark' })
  const oscuro = await o.evaluate(() => {
    const badge = document.querySelector('.badge')
    const bg = getComputedStyle(badge).backgroundColor
    const fondo = getComputedStyle(document.body).backgroundColor
    return { badgeFondo: bg, opaco: !/rgba\(.+, 0?\.\d+\)/.test(bg), body: fondo }
  })
  await o.close()
  const m = await abrir(b, '', { viewport: { width: 360, height: 780 } })
  const movil = await m.evaluate(() => ({
    paginaScrollX: document.documentElement.scrollWidth > innerWidth,
    tablaScrollX: document.querySelector('[role="region"]').scrollWidth > document.querySelector('[role="region"]').clientWidth,
  }))
  await m.close()
  ok('T12', a.caption === 'Facturas' && a.thScope && a.regionEnfocable === '0' && a.checkboxConNombre && oscuro.opaco && !movil.paginaScrollX && movil.tablaScrollX, { ...a, oscuro, movil360: movil })
}

await b.close()
ok('sin errores de página', errores.length === 0, errores.slice(0, 5))
const fallan = Object.entries(R).filter(([, v]) => !v.pasa).map(([k]) => k)
console.log(`\n${Object.keys(R).length - fallan.length}/${Object.keys(R).length} checks pasan${fallan.length ? ' — fallan: ' + fallan.join(', ') : ''}`)
import('node:fs').then((fs) => fs.writeFileSync(new globalThis.URL('./resultado.json', import.meta.url), JSON.stringify(R, null, 2)))
