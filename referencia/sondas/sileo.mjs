// Sondas de la capa de avisos (Sileo): capa, texto, teclado, lector de pantalla,
// movimiento, contraste, vida del botón y promesa.
//
// Uso: node sileo.mjs [carpeta-capturas]   (con la app corriendo)
//
// ── ADAPTA ESTE BLOQUE A TU APP ─────────────────────────────────────────────
// Cada función recibe la página de Playwright y hace lo que diría su nombre.
// Los valores por defecto son los de la tabla de facturas de referencia.
const APP = {
  url: process.env.URL ?? 'http://localhost:3022/',
  listo: 'tbody button[data-folio]', // selector que indica que la página cargó
  /** Conteo que cambia al hacer y deshacer la acción (para verificar el Deshacer). */
  conteo: async (p) => Number((await p.locator('h1 + p').innerText()).match(/\d+/)[0]),
  /** Una acción reversible que lanza un aviso CON botón Deshacer. */
  accionConDeshacer: async (p) => {
    await p.locator('tbody tr').first().locator('td:last-child button').click()
    await p.getByRole('menuitem', { name: 'Eliminar' }).click()
  },
  /** La misma acción, sólo con teclado (para el atajo ⌘Z). */
  accionConDeshacerTeclado: async (p) => {
    await p.locator('tbody tr').first().locator('td:last-child button').focus()
    await p.keyboard.press('Enter')
    await p.waitForTimeout(100) // el foco pasa al menú en el siguiente frame
    await p.keyboard.press('End')
    await p.keyboard.press('Enter')
  },
  /** Un aviso simple, sin botón. Su título debe contener `textoSimple`. */
  avisoSimple: async (p) => {
    await p.locator('tbody tr').first().locator('td:last-child button').click()
    await p.getByRole('menuitem', { name: 'Copiar folio' }).click()
  },
  textoSimple: /copiado/i,
  /** Abre un drawer o modal y lanza, desde adentro, un aviso con botón. */
  avisoDesdeDrawer: async (p) => {
    await p.locator('tbody button[data-folio]').first().click()
    await p.locator('[role="dialog"] footer button', { hasText: 'Registrar pago' }).click()
  },
  /** Dispara un sileo.promise; devuelve cuando la operación terminó. `null` = no aplica. */
  promesa: async (p) => {
    await p.getByRole('button', { name: '+ Nueva factura' }).click()
    await p.getByRole('tab', { name: 'Carga masiva (Excel)' }).click()
    await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descargar plantilla (.xlsx)' }).click()])
  },
  titulosPromesa: ['Generando plantilla…', 'Plantilla descargada'],
  duracionDeshacer: 10_000,
}
// ────────────────────────────────────────────────────────────────────────────

import { chromium } from '@playwright/test'
const out = process.argv[2]
const R = {}
const ok = (id, pasa, ev) => { R[id] = { pasa, ev }; console.log(`${pasa ? '✓' : '✗'} ${id} — ${JSON.stringify(ev)}`) }
const b = await chromium.launch()
const errores = []
async function abrir(opts = {}) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts })
  p.on('pageerror', (e) => errores.push(e.message))
  await p.goto(APP.url)
  await p.waitForSelector(APP.listo)
  return p
}
// Hit-test: ¿el punto central del elemento es del elemento? (el z-index a ojo miente)
const hit = (p, sel) => p.evaluate((sel) => {
  const t = document.querySelector(sel)
  if (!t) return 'no existe'
  const r = t.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return t.contains(top) || top === t ? 'clicable' : `tapado por ${top?.closest('[class]')?.className?.toString().slice(0, 40) || top?.tagName}`
}, sel)
const expandido = async (p) => { await p.waitForSelector('[data-sileo-button]', { state: 'visible' }); await p.waitForTimeout(700) }

// S1 capa: aviso lanzado desde el drawer, con el drawer abierto
{
  const p = await abrir()
  await APP.avisoDesdeDrawer(p)
  await expandido(p)
  const z = await p.evaluate(() => getComputedStyle(document.querySelector('[data-sileo-viewport]')).zIndex)
  const toast = await hit(p, '[data-sileo-toast]')
  const boton = await hit(p, '[data-sileo-button]')
  if (out) await p.screenshot({ path: `${out}/sileo-drawer.png` })
  ok('S1 encima del drawer', toast === 'clicable' && boton === 'clicable', { zIndexViewport: z, toast, boton })
  await p.close()
}

// S2 texto: el título conserva mayúsculas y minúsculas
{
  const p = await abrir()
  await APP.accionConDeshacer(p)
  await p.waitForTimeout(300)
  const t = await p.evaluate(() => {
    const el = document.querySelector('[data-sileo-title]')
    return { texto: el?.textContent, visible: el?.innerText, transform: el && getComputedStyle(el).textTransform }
  })
  ok('S2 título sin capitalizar', t.texto === t.visible, t)
  await p.close()
}

// S3 teclado: el enlace del aviso recibe foco y Enter deshace; y ⌘Z / Ctrl+Z deshace
{
  const p = await abrir()
  const antes = await APP.conteo(p)
  await APP.accionConDeshacerTeclado(p)
  await p.waitForTimeout(900)
  const trasAccion = await APP.conteo(p)
  const enlace = await p.evaluate(() => { const a = document.querySelector('[data-sileo-button]'); a?.focus(); return { enfocable: document.activeElement === a, tag: a?.tagName } })
  let trasEnter = null
  if (enlace.enfocable) { await p.keyboard.press('Enter'); await p.waitForTimeout(200); trasEnter = await APP.conteo(p) }
  await APP.accionConDeshacer(p)
  await p.waitForTimeout(100)
  const trasAccion2 = await APP.conteo(p)
  await p.locator('body').click({ position: { x: 5, y: 5 } })
  await p.keyboard.press('ControlOrMeta+z')
  await p.waitForTimeout(200)
  const trasAtajo = await APP.conteo(p)
  ok('S3 deshacer sin ratón', trasAccion !== antes && trasEnter === antes && trasAtajo === antes && trasAccion2 !== antes,
    { antes, trasAccion, enlace, trasEnter, trasAccion2, trasAtajo })
  await p.close()
}

// S4 lector de pantalla: región viva y nombre accesible sin el ruido de los SVG
{
  const p = await abrir()
  await APP.avisoSimple(p)
  await p.waitForTimeout(300)
  const v = await p.evaluate(() => {
    const live = document.querySelector('[aria-live]')
    return { ariaLive: live?.getAttribute('aria-live'), texto: live?.textContent?.slice(0, 80) }
  })
  v.nombreAccesible = (await p.locator('[data-sileo-viewport]').ariaSnapshot()).split('\n')[0]
  ok('S4 región viva', v.ariaLive === 'polite' && APP.textoSimple.test(v.texto ?? '') && !/Sileo Notification|Check/.test(v.nombreAccesible), v)
  await p.close()
}

// S5 movimiento reducido: sin transiciones ni animaciones
{
  const p = await abrir({ reducedMotion: 'reduce' })
  await APP.avisoSimple(p)
  await p.waitForTimeout(100)
  const m = await p.evaluate(() => ({
    transition: getComputedStyle(document.querySelector('[data-sileo-toast]')).transitionDuration,
    animacionTitulo: getComputedStyle(document.querySelector('[data-sileo-header-inner]')).animationDuration,
  }))
  ok('S5 movimiento reducido', m.transition.split(',').every((x) => parseFloat(x) === 0) && parseFloat(m.animacionTitulo) === 0, m)
  await p.close()
}

// S6 tema: contraste del título contra el fondo del aviso, en claro y oscuro
{
  const res = {}
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] }
  for (const scheme of ['light', 'dark']) {
    const p = await abrir({ colorScheme: scheme })
    await APP.avisoSimple(p)
    await p.waitForTimeout(400)
    res[scheme] = await p.evaluate(() => {
      // oklch/var → rgb real: se pinta un píxel y se lee (parsear el texto del color miente con oklch)
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
      const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data; return `rgb(${r}, ${g}, ${b})` }
      const rect = document.querySelector('[data-sileo-svg] [fill]:not([fill="none"])')
      return { fill: rgb(getComputedStyle(rect).fill), colorTitulo: rgb(getComputedStyle(document.querySelector('[data-sileo-title]')).color) }
    })
    const [a, z] = [lum(res[scheme].colorTitulo), lum(res[scheme].fill)]
    res[scheme].contraste = +((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)).toFixed(2)
    if (out) await p.screenshot({ path: `${out}/sileo-${scheme}.png` })
    await p.close()
  }
  ok('S6 contraste', res.light.contraste >= 4.5 && res.dark.contraste >= 4.5, res)
}

// S7 el Deshacer sigue visible toda la vida del aviso (Sileo colapsa a los 4 s fijos)
{
  const p = await abrir()
  await APP.accionConDeshacer(p)
  const t = {}
  let previo = 0
  for (const ms of [500, 3000, 6000, APP.duracionDeshacer - 1500]) {
    await p.waitForTimeout(ms - previo); previo = ms
    t[`${ms}ms`] = await hit(p, '[data-sileo-button]')
  }
  ok('S7 Deshacer visible toda la vida', Object.values(t).every((v) => v === 'clicable'), t)
  await p.close()
}

// S8 sileo.promise: un solo aviso que pasa de «cargando» a «listo»
if (APP.promesa) {
  const p = await abrir()
  const titulos = new Set()
  const vigia = setInterval(async () => { (await p.locator('[data-sileo-title]').allInnerTexts().catch(() => [])).forEach((x) => titulos.add(x)) }, 40)
  await APP.promesa(p)
  await p.waitForTimeout(800)
  clearInterval(vigia)
  const avisos = await p.locator('[data-sileo-toast]').count()
  ok('S8 promesa', APP.titulosPromesa.every((x) => titulos.has(x)) && avisos === 1, { titulosVistos: [...titulos], avisosEnPantalla: avisos })
  await p.close()
}

await b.close()
ok('sin errores de página', errores.length === 0, errores.slice(0, 3))
const fallan = Object.entries(R).filter(([, v]) => !v.pasa).map(([k]) => k)
console.log(`\n${Object.keys(R).length - fallan.length}/${Object.keys(R).length} pasan${fallan.length ? ' — fallan: ' + fallan.join(', ') : ''}`)
process.exitCode = fallan.length ? 1 : 0
