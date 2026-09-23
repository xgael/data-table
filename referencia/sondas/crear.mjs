// Sondas del alta: botón por permiso, formulario, plantilla .xlsx y carga masiva.
// Uso: node .sondas/crear.mjs   (servidor en :3022)
import { chromium } from '@playwright/test'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = 'http://localhost:3022/'
const TMP = mkdtempSync(join(tmpdir(), 'sonda-crear-'))
const R = {}
const ok = (id, pasa, ev) => {
  R[id] = { pasa, evidencia: ev }
  console.log(`${pasa ? '✓' : '✗'} ${id} — ${JSON.stringify(ev)}`)
}
const errores = []
const b = await chromium.launch()
async function abrir(qs = '') {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)))
  await p.goto(URL + qs)
  await p.waitForSelector('tbody button[data-folio]')
  return p
}
const conteo = async (p) => Number((await p.locator('h1 + p').innerText()).match(/\d+/)[0])
const abrirModal = async (p, tab) => {
  await p.getByRole('button', { name: '+ Nueva factura' }).click()
  if (tab) await p.getByRole('tab', { name: tab }).click()
}

// ── C1 permiso: el botón existe para quien puede crear y no existe para quien no
{
  const res = {}
  for (const rol of ['admin', 'cobranza', 'consulta']) {
    const p = await abrir(rol === 'admin' ? '' : `?rol=${rol}`)
    res[rol] = await p.getByRole('button', { name: '+ Nueva factura' }).count()
    await p.close()
  }
  const v = await b.newPage()
  await v.goto(URL + '?demo=vacio&rol=consulta')
  await v.waitForSelector('tbody td[colspan]')
  res.vacioConsultaCTA = await v.getByRole('button', { name: 'Crear una factura' }).count()
  await v.goto(URL + '?demo=vacio')
  await v.waitForSelector('tbody td[colspan]')
  res.vacioAdminCTA = await v.getByRole('button', { name: 'Crear una factura' }).count() + await v.getByRole('button', { name: 'Importar desde Excel' }).count()
  await v.close()
  ok('C1 permiso', res.admin === 1 && res.cobranza === 1 && res.consulta === 0 && res.vacioConsultaCTA === 0 && res.vacioAdminCTA === 2, res)
}

// ── C2 formulario
{
  const p = await abrir()
  const antes = await conteo(p)
  await abrirModal(p)
  const dlg = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    return { modal: d.getAttribute('aria-modal'), foco: document.activeElement?.id || document.activeElement?.getAttribute('aria-label') }
  })
  // vacío → un error por obligatorio, foco al primero, aria-invalid
  await p.getByRole('button', { name: 'Crear factura' }).click()
  const vacio = await p.evaluate(() => ({
    invalidos: [...document.querySelectorAll('[role="dialog"] [aria-invalid="true"]')].map((e) => e.id),
    foco: document.activeElement?.id,
    describe: document.getElementById('c-cliente')?.getAttribute('aria-describedby'),
  }))
  // reglas: largo, anticipo > monto, vence < emisión, 3 decimales
  await p.locator('#c-cliente').fill('x'.repeat(121))
  await p.locator('#c-categoria').selectOption('Cámara y foto')
  await p.locator('#c-monto').fill('1000.555')
  await p.locator('#c-anticipo').fill('5000')
  await p.locator('#c-emision').fill('2026-09-15')
  await p.locator('#c-vence').fill('2026-09-01')
  await p.locator('#c-responsable').selectOption('Sofía Garza')
  await p.getByRole('button', { name: 'Crear factura' }).click()
  const msgs = await p.locator('[role="dialog"] [id^="e-"]').allInnerTexts()
  const contador = await p.locator('#n-cliente').innerText()
  const valorCliente = (await p.locator('#c-cliente').inputValue()).length // sin recorte silencioso
  // corregir en vivo
  await p.locator('#c-cliente').fill('Café Ñandú')
  await p.locator('#c-monto').fill('$12,500.50')
  await p.locator('#c-anticipo').fill('2500')
  await p.locator('#c-vence').fill('2026-10-15')
  const trasCorregir = await p.locator('[role="dialog"] [aria-invalid="true"]').count()
  // crear y agregar otra
  await p.getByRole('button', { name: 'Crear y agregar otra' }).click()
  await p.waitForTimeout(100)
  const sigueAbierto = await p.locator('[role="dialog"]').count()
  const limpio = await p.locator('#c-cliente').inputValue()
  const focoTrasOtra = await p.evaluate(() => document.activeElement?.id)
  const creadas = await p.locator('[role="dialog"] [role="status"]').innerText().catch(() => '')
  const tras1 = await conteo(p)
  // Esc con datos → confirmar; Esc otra vez → seguir editando; Descartar cierra y devuelve foco
  await p.locator('#c-cliente').fill('borrador')
  await p.keyboard.press('Escape')
  const confirma = await p.getByRole('alertdialog').count()
  await p.keyboard.press('Escape')
  const volvio = { alert: await p.getByRole('alertdialog').count(), valor: await p.locator('#c-cliente').inputValue() }
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Descartar' }).click()
  const cerrado = await p.locator('[role="dialog"]').count()
  const focoBoton = await p.evaluate(() => document.activeElement?.id)
  // la nueva factura existe con los datos normalizados
  await p.getByPlaceholder('Buscar folio, cliente, categoría, estado…').fill(creadas.replace('Creadas: ', ''))
  await p.waitForTimeout(150)
  const fila = await p.locator('tbody tr').first().innerText()
  // Deshacer del alta
  ok('C2 formulario', dlg.modal === 'true' && dlg.foco === 'c-cliente' && vacio.invalidos.length === 5 && vacio.foco === 'c-cliente' &&
    msgs.some((m) => /máximo 120.*121/.test(m)) && msgs.some((m) => /2 decimales/.test(m)) && msgs.some((m) => /antes de la emisión/.test(m)) &&
    valorCliente === 121 && trasCorregir === 0 && sigueAbierto === 1 && limpio === '' && focoTrasOtra === 'c-cliente' &&
    tras1 === antes + 1 && confirma === 1 && volvio.alert === 0 && volvio.valor === 'borrador' && cerrado === 0 && focoBoton === 'btn-nueva' &&
    /Café Ñandú/.test(fila) && /\$12,500\.50/.test(fila) && /Pendiente/.test(fila), {
    focoAlAbrir: dlg.foco, obligatoriosVacios: vacio.invalidos, focoPrimerError: vacio.foco, describedby: vacio.describe,
    mensajes: msgs, contador, largoConservado: valorCliente, invalidosTrasCorregir: trasCorregir,
    crearYOtra: { sigueAbierto, limpio: limpio === '', foco: focoTrasOtra, creadas }, conteo: [antes, tras1],
    escConDatos: { confirma, escOtraVez: volvio }, descartar: { cerrado: cerrado === 0, focoA: focoBoton }, filaNueva: fila.replace(/\s+/g, ' '),
  })
  await p.close()
}

// ── C3 plantilla: lo que trae el .xlsx descargado
const plantillaPath = join(TMP, 'plantilla.xlsx')
{
  const p = await abrir()
  await abrirModal(p, 'Carga masiva (Excel)')
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Descargar plantilla (.xlsx)' }).click()])
  await dl.saveAs(plantillaPath)
  await p.close()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(plantillaPath))
  const ws = wb.getWorksheet('Facturas')
  const cab = ws.getRow(1).values.slice(1)
  const listas = wb.getWorksheet('Listas')
  const colLista = (L) => { const out = []; for (let i = 1; listas.getCell(`${L}${i}`).value; i++) out.push(listas.getCell(`${L}${i}`).value); return out }
  // ExcelJS al LEER expande cada rango en celdas; lo que Excel verá está en el XML (sqref).
  const xml = await (await JSZip.loadAsync(readFileSync(plantillaPath))).file('xl/worksheets/sheet1.xml').async('string')
  const reglas = Object.fromEntries([...xml.matchAll(/<dataValidation ([^>]*)>([\s\S]*?)<\/dataValidation>/g)].map(([, attrs, cuerpo]) => {
    const at = (n) => attrs.match(new RegExp(`${n}="([^"]*)"`))?.[1]
    const fs = [...cuerpo.matchAll(/<formula\d>([^<]*)<\/formula\d>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    return [at('sqref'), `${at('type')}${at('operator') ? ':' + at('operator') : ''} ${fs.join(' ')}`]
  }))
  const ins = wb.getWorksheet('Instrucciones')
  const insTxt = []; ins.eachRow((r) => insTxt.push(r.values.slice(1).join(' | ')))
  ok('C3 plantilla', cab.join() === 'Cliente *,Categoría *,Monto *,Anticipo,Emisión *,Vence,Responsable *,Notas' &&
    listas.state === 'veryHidden' && colLista('A').includes('Cámara y foto') && colLista('B').includes('Sofía Garza') &&
    reglas['B2:B1001']?.startsWith('list') && /D2>=0,D2<=C2/.test(reglas['D2:D1001']) && /F2>=E2/.test(reglas['F2:F1001']) &&
    reglas['C2:C1001'] === 'decimal:greaterThan 0' && /textLength:lessThanOrEqual 120/.test(reglas['A2:A1001']) &&
    ws.views[0]?.state === 'frozen' && wb.subject === 'plantilla:facturas:v1', {
    hojas: wb.worksheets.map((w) => `${w.name}${w.state !== 'visible' ? ` (${w.state})` : ''}`), encabezados: cab,
    listas: { categorias: colLista('A'), responsables: colLista('B') }, reglas, encabezadoCongelado: ws.views[0]?.state, version: wb.subject,
    instrucciones: insTxt.slice(0, 3),
  })
}

// Helpers para construir archivos de carga A PARTIR de la plantilla descargada
async function archivoDesdePlantilla(nombre, filas, { quitarColumna, filasExtra = 0 } = {}) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(plantillaPath))
  const ws = wb.getWorksheet('Facturas')
  filas.forEach((f, i) => ws.getRow(i + 2).values = f)
  for (let i = 0; i < filasExtra; i++) ws.getRow(filas.length + 2 + i).values = ['Cliente', 'Diseño', 100, null, new Date(Date.UTC(2026, 8, 1)), null, 'Luis Méndez']
  if (quitarColumna) ws.spliceColumns(quitarColumna, 1)
  const ruta = join(TMP, nombre)
  await wb.xlsx.writeFile(ruta)
  return ruta
}
async function subir(p, ruta) {
  await p.locator('[role="tabpanel"] input[type=file]').setInputFiles(ruta)
  await p.waitForSelector('[role="tabpanel"] [role="alert"], [role="tabpanel"] strong', { timeout: 15000 })
}
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d))

// ── C4 carga feliz: lo que realmente manda Excel (Date, número, texto con $, minúsculas, dd/mm/aaaa)
{
  const ruta = await archivoDesdePlantilla('buena.xlsx', [
    ['Óptica Álvarez', 'Cámara y foto', 15000, 5000, D(2026, 9, 1), D(2026, 10, 1), 'Ana Rodríguez', 'Primera'],
    ['Café Ñandú', 'diseño', '$12,500.50', null, '15/09/2026', null, 'sofia garza', null],
    ['Hotel Las Ánimas', 'EVENTO', 8000, 0, D(2026, 5, 1), D(2026, 6, 1), 'Iván Téllez', null],
    [],
    ['Librería El Búho', 'Consultoría', 3200.1, null, 46280, null, 'Luis Méndez', { richText: [{ text: 'Rich ' }, { text: 'text' }] }],
  ])
  const p = await abrir()
  const antes = await conteo(p)
  await abrirModal(p, 'Carga masiva (Excel)')
  await subir(p, ruta)
  const resumen = await p.locator('[role="tabpanel"] p', { hasText: 'leída' }).innerText()
  const boton = await p.getByRole('button', { name: /^Importar/ }).innerText()
  await p.getByRole('button', { name: /^Importar/ }).click()
  await p.waitForTimeout(150)
  const despues = await conteo(p)
  const toast = await p.locator('[data-sileo-title]').last().innerText()
  await p.getByPlaceholder('Buscar folio, cliente, categoría, estado…').fill('ánimas')
  await p.waitForTimeout(100)
  const animas = await p.locator('tbody tr').allInnerTexts()
  const nueva = animas.find((t) => /8,000\.00/.test(t)) ?? ''
  await p.getByPlaceholder('Buscar folio, cliente, categoría, estado…').fill('')
  await p.getByRole('link', { name: 'Deshacer' }).last().click()
  await p.waitForTimeout(100)
  const trasDeshacer = await conteo(p)
  ok('C4 carga válida', resumen.includes('4 filas leídas') && resumen.includes('4 listas') && boton === 'Importar 4 facturas' &&
    despues === antes + 4 && trasDeshacer === antes && /Vencida/.test(nueva) && /\$0\.00/.test(nueva), {
    resumen: resumen.replace(/\s+/g, ' '), boton, conteo: [antes, despues, trasDeshacer], toast: toast.split('\n')[0],
    filaVieja_vencidaYAnticipoCero: nueva.replace(/\s+/g, ' '),
  })
  await p.close()
}

// ── C5 carga con errores: fila exacta, mensaje claro, importar sólo las válidas, archivo de errores re-subible
{
  const ruta = await archivoDesdePlantilla('mala.xlsx', [
    ['Bueno 1', 'Diseño', 1000, null, D(2026, 9, 1), null, 'Luis Méndez'],            // fila 2 ok
    ['Malo categoría', 'Fotografía', 1000, null, D(2026, 9, 1), null, 'Luis Méndez'], // 3
    ['Malo anticipo', 'Diseño', 1000, 2000, D(2026, 9, 1), null, 'Luis Méndez'],      // 4
    ['Malo fecha', 'Diseño', 1000, null, '31/02/2026', null, 'Luis Méndez'],          // 5
    [null, 'Diseño', 1000, null, D(2026, 9, 1), null, 'Luis Méndez'],                 // 6 sin cliente
    ['Malo monto', 'Diseño', -50, null, D(2026, 9, 1), null, 'Pedro Páramo'],         // 7 dos errores
    ['Malo notas', 'Diseño', 1000, null, D(2026, 9, 1), null, 'Luis Méndez', 'x'.repeat(600)], // 8
    ['Bueno 2', 'Evento', 2000, null, D(2026, 9, 2), D(2026, 9, 30), 'Mónica Ortiz'], // 9 ok
  ])
  const p = await abrir()
  const antes = await conteo(p)
  await abrirModal(p, 'Carga masiva (Excel)')
  await subir(p, ruta)
  const resumen = await p.locator('[role="tabpanel"] p', { hasText: 'leída' }).innerText()
  const filasErr = (await p.locator('[aria-label="Errores por fila"] tbody tr').allInnerTexts()).map((t) => t.split('\t').join(' | '))
  const boton = await p.getByRole('button', { name: /^Importar/ }).innerText()
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Descargar las \d+ filas con errores/ }).click()])
  const rutaErr = join(TMP, 'errores.xlsx')
  await dl.saveAs(rutaErr)
  await p.getByRole('button', { name: /^Importar/ }).click()
  await p.waitForTimeout(150)
  const despues = await conteo(p)
  // el archivo de errores: sólo las malas, con columna Errores; re-subido, la columna se ignora sin aviso
  const wbE = new ExcelJS.Workbook(); await wbE.xlsx.load(readFileSync(rutaErr))
  const wsE = wbE.getWorksheet('Facturas')
  const cabE = wsE.getRow(1).values.slice(1)
  const clientesE = []; for (let r = 2; r <= wsE.rowCount; r++) clientesE.push(wsE.getRow(r).getCell(1).value ?? '(vacío)')
  const errCol = wsE.getRow(3).getCell(cabE.indexOf('Errores') + 1).value
  await abrirModal(p, 'Carga masiva (Excel)')
  await subir(p, rutaErr)
  const avisosRe = await p.locator('[role="tabpanel"] ul li').allInnerTexts()
  const resumenRe = await p.locator('[role="tabpanel"] p', { hasText: 'leída' }).innerText()
  const esperadas = ['3 | Categoría', '4 | Anticipo', '5 | Emisión', '6 | Cliente', '7 | Monto', '7 | Responsable', '8 | Notas']
  ok('C5 carga con errores', resumen.includes('8 filas leídas') && resumen.includes('2 listas') && resumen.includes('6 con errores') &&
    esperadas.every((e) => filasErr.some((f) => f.startsWith(e))) && boton === 'Importar 2 válidas y omitir 6' && despues === antes + 2 &&
    clientesE.length === 6 && cabE.includes('Errores') && /Anticipo/.test(errCol) && avisosRe.length === 0 && resumenRe.includes('6 con errores'), {
    resumen: resumen.replace(/\s+/g, ' '), errores: filasErr, boton, conteo: [antes, despues],
    archivoErrores: { encabezados: cabE, filas: clientesE, columnaErroresFila3: errCol }, resubido: { resumen: resumenRe.replace(/\s+/g, ' '), avisos: avisosRe },
  })
  await p.close()
}

// ── C6 fatales: guían en vez de fallar raro
{
  const faltaCol = await archivoDesdePlantilla('sin-monto.xlsx', [['X', 'Diseño', 1, null, D(2026, 9, 1), null, 'Luis Méndez']], { quitarColumna: 3 })
  const demasiadas = await archivoDesdePlantilla('1001.xlsx', [], { filasExtra: 1001 })
  const falso = join(TMP, 'falso.xlsx'); writeFileSync(falso, 'esto no es un xlsx')
  const csv = join(TMP, 'datos.csv'); writeFileSync(csv, 'Cliente,Monto\nX,1')
  const vacio = await archivoDesdePlantilla('vacia.xlsx', [])
  const p = await abrir()
  const res = {}
  for (const [k, ruta] of Object.entries({ faltaCol, demasiadas, falso, csv, vacio })) {
    await abrirModal(p, 'Carga masiva (Excel)')
    await subir(p, ruta)
    res[k] = await p.locator('[role="tabpanel"] [role="alert"]').innerText().catch(() => '(sin alerta)')
    res[k + 'Boton'] = await p.getByRole('button', { name: /^Importar/ }).isDisabled()
    await p.keyboard.press('Escape')
    await p.getByRole('button', { name: 'Descartar' }).click()
  }
  ok('C6 archivos inválidos', /Faltan columnas obligatorias: Monto/.test(res.faltaCol) && /más de 1000/.test(res.demasiadas) &&
    /no es un .xlsx válido/.test(res.falso) && /debe ser .xlsx/.test(res.csv) && /no tiene filas con datos/.test(res.vacio) &&
    Object.keys(res).filter((k) => k.endsWith('Boton')).every((k) => res[k]), res)
  await p.close()
}

// ── C7 pestañas y teclado
{
  const p = await abrir()
  await abrirModal(p)
  await p.getByRole('tab', { name: 'Una factura' }).focus()
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(50)
  const t = await p.evaluate(() => ({
    foco: document.activeElement?.textContent,
    seleccionada: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    panelVisible: !document.getElementById('panel-masiva').hidden,
    panelOculto: document.getElementById('panel-una').hidden,
  }))
  // Tab nunca sale del modal
  let fuga = false
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)))) fuga = true }
  // Esc sin datos cierra directo
  await p.keyboard.press('Escape')
  const cerrado = await p.locator('[role="dialog"]').count()
  // el clic en el fondo NO cierra
  await abrirModal(p)
  await p.mouse.click(20, 450)
  const sigue = await p.locator('[role="dialog"]').count()
  ok('C7 teclado', t.foco === 'Carga masiva (Excel)' && t.seleccionada === t.foco && t.panelVisible && t.panelOculto && !fuga && cerrado === 0 && sigue === 1, { ...t, trampaSinFuga: !fuga, escSinDatosCierra: cerrado === 0, clicFondoNoCierra: sigue === 1 })
  await p.close()
}

await b.close()
ok('sin errores de página', errores.length === 0, errores.slice(0, 5))
const fallan = Object.entries(R).filter(([, v]) => !v.pasa).map(([k]) => k)
console.log(`\n${Object.keys(R).length - fallan.length}/${Object.keys(R).length} checks pasan${fallan.length ? ' — fallan: ' + fallan.join(', ') : ''}`)
