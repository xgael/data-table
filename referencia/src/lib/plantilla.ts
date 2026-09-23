// Plantilla .xlsx y lectura de la carga masiva. Todo sale de ESQUEMA: los
// encabezados, las listas (catálogos y FK), las reglas de Excel y la validación.
// ExcelJS pesa ~1 MB: se importa dinámicamente, sólo al usarlo.
import type { CellValue, DataValidation, Workbook, Worksheet } from 'exceljs'
import type { NuevaFactura } from './facturas'
import { ESQUEMA, MAX_BYTES, MAX_FILAS, normalizar, validar, VERSION_PLANTILLA, type Campo, type Clave } from './esquema'

const HOJA = 'Facturas'
const COL_ERRORES = 'Errores'
const letra = (i: number) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
const encabezado = (c: Campo) => (c.requerido ? `${c.etiqueta} *` : c.etiqueta)

async function excel() {
  return (await import('exceljs')).default
}

// ── Plantilla
export type FilaConError = { fila: number; bruto: Partial<Record<Clave, unknown>>; mensajes: string[] }

export async function descargarPlantilla(filasConError?: FilaConError[]) {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'data-table-lab'
  wb.subject = VERSION_PLANTILLA
  wb.created = new Date()

  const ws = wb.addWorksheet(HOJA, { views: [{ state: 'frozen', ySplit: 1 }] })
  const listas = wb.addWorksheet('Listas')
  listas.state = 'veryHidden' // no se ve ni se des-oculta desde el menú de Excel
  hojaInstrucciones(wb)

  // Existe en ExcelJS 4.4 (escribe un solo <dataValidation sqref="C2:C1001">), pero sus tipos no lo declaran.
  const reglas = (ws as Worksheet & { dataValidations: { add(rango: string, v: DataValidation): void } }).dataValidations
  const col: Record<string, string> = {}
  ESQUEMA.forEach((c, i) => (col[c.clave] = letra(i)))
  const ultima = MAX_FILAS + 1

  ws.columns = [
    ...ESQUEMA.map((c) => ({
      header: encabezado(c),
      key: c.clave,
      width: c.largo ? 48 : c.tipo === 'texto' ? 32 : c.tipo === 'opcion' ? 24 : 16,
      style: c.tipo === 'numero' ? { numFmt: '#,##0.00' } : c.tipo === 'fecha' ? { numFmt: 'dd/mm/yyyy' } : {},
    })),
    ...(filasConError ? [{ header: COL_ERRORES, key: '_errores', width: 60 }] : []),
  ]
  const cab = ws.getRow(1)
  cab.font = { bold: true }
  cab.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEC' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFBDBDB8' } } }
  })

  // Listas: una columna por catálogo, en la hoja oculta. Referenciar un rango
  // evita el tope de 255 caracteres de las listas escritas en la regla.
  let li = 0
  for (const c of ESQUEMA) {
    const ayuda = c.tipo === 'fecha' ? `${c.ayuda} Formato dd/mm/aaaa.` : c.ayuda
    const r = { prompt: ayuda.slice(0, 250), promptTitle: c.etiqueta, showInputMessage: true, showErrorMessage: true, errorStyle: 'stop', errorTitle: c.etiqueta }
    const rango = `${col[c.clave]}2:${col[c.clave]}${ultima}`
    const celda = `${col[c.clave]}2`
    if (c.tipo === 'opcion') {
      const ops = c.opciones!()
      const L = letra(li++)
      ops.forEach((o, i) => (listas.getCell(`${L}${i + 1}`).value = o))
      reglas.add(rango, { ...r, type: 'list', allowBlank: !c.requerido, formulae: [`Listas!$${L}$1:$${L}$${ops.length}`], error: 'Elige un valor de la lista.' })
    } else if (c.clave === 'anticipo') {
      reglas.add(rango, { ...r, type: 'custom', allowBlank: true, formulae: [`AND(ISNUMBER(${celda}),${celda}>=0,${celda}<=${col.monto}2)`], error: 'Número de 0 hasta el monto.' })
    } else if (c.tipo === 'numero') {
      reglas.add(rango, { ...r, type: 'decimal', operator: c.minExclusivo ? 'greaterThan' : 'greaterThanOrEqual', allowBlank: !c.requerido, formulae: [c.min ?? 0], error: c.minExclusivo ? 'Número mayor que 0.' : 'Número de 0 en adelante.' })
    } else if (c.clave === 'vence') {
      reglas.add(rango, { ...r, type: 'custom', allowBlank: true, formulae: [`AND(ISNUMBER(${celda}),${celda}>=${col.emision}2)`], error: 'Fecha igual o posterior a la emisión.' })
    } else if (c.tipo === 'fecha') {
      reglas.add(rango, { ...r, type: 'date', operator: 'between', allowBlank: !c.requerido, formulae: [new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2100, 11, 31))], error: 'Escribe una fecha (dd/mm/aaaa).' })
    } else {
      reglas.add(rango, { ...r, type: 'textLength', operator: 'lessThanOrEqual', allowBlank: !c.requerido, formulae: [c.max ?? 255], error: `Máximo ${c.max} caracteres.` })
    }
  }

  for (const f of filasConError ?? []) {
    ws.addRow({ ...f.bruto, _errores: f.mensajes.join(' · ') })
  }
  if (filasConError) ws.getColumn('_errores').font = { color: { argb: 'FFB42318' } }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filasConError ? 'facturas-con-errores.xlsx' : 'plantilla-facturas.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

function hojaInstrucciones(wb: Workbook) {
  const ws: Worksheet = wb.addWorksheet('Instrucciones')
  ws.columns = [{ width: 16 }, { width: 13 }, { width: 11 }, { width: 46 }, { width: 22 }]
  const t = ws.addRow(['Cómo llenar la plantilla de facturas'])
  t.font = { bold: true, size: 14 }
  for (const l of [
    `Llena la hoja «${HOJA}», una factura por fila, a partir de la fila 2. No cambies los encabezados.`,
    `Máximo ${MAX_FILAS} filas por archivo. Guarda como Libro de Excel (.xlsx).`,
    'Folio y estado los asigna el sistema; no van en la plantilla.',
    'Las columnas con * son obligatorias. Las listas traen los valores vigentes al descargar la plantilla.',
    'Excel valida al escribir; si pegas datos, esa validación se salta, pero la carga revisa todo otra vez y te dice fila por fila qué corregir.',
  ]) ws.addRow([l])
  ws.addRow([])
  const h = ws.addRow(['Columna', 'Obligatoria', 'Tipo', 'Valores permitidos', 'Ejemplo'])
  h.font = { bold: true }
  const TIPO = { texto: 'Texto', numero: 'Número', fecha: 'Fecha', opcion: 'Lista' }
  for (const c of ESQUEMA) {
    const permitidos =
      c.tipo === 'opcion' ? c.opciones!().join(', ')
      : c.tipo === 'texto' ? `Hasta ${c.max} caracteres. ${c.ayuda}`
      : c.tipo === 'fecha' ? `${c.ayuda} Formato dd/mm/aaaa.`
      : c.ayuda
    ws.addRow([c.etiqueta, c.requerido ? 'Sí' : 'No', TIPO[c.tipo], permitidos, c.ejemplo]).alignment = { wrapText: true, vertical: 'top' }
  }
}

// ── Lectura de la carga
export type Revision = {
  leidas: number
  validas: { fila: number; valor: NuevaFactura }[]
  errores: { fila: number; etiqueta: string; valor: string; mensaje: string }[]
  filasConError: FilaConError[]
  avisos: string[]
}
export type Lectura = { fatal: string } | Revision

function valorCelda(v: CellValue): unknown {
  if (v == null || v instanceof Date || typeof v !== 'object') return v
  if ('result' in v) return valorCelda(v.result as CellValue) // fórmula → su resultado
  if ('richText' in v) return v.richText.map((t) => t.text).join('')
  if ('text' in v) return v.text // hipervínculo
  if ('error' in v) return v.error // #N/A, #REF!… llega como texto y falla la validación
  return String(v)
}

const mostrar = (v: unknown) => {
  if (v == null || v === '') return '(vacío)'
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
  const s = String(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

export async function leerCarga(archivo: File): Promise<Lectura> {
  if (!/\.xlsx$/i.test(archivo.name))
    return { fatal: 'El archivo debe ser .xlsx. Si es .xls o .csv, ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)».' }
  if (archivo.size > MAX_BYTES)
    return { fatal: `El archivo pesa ${(archivo.size / 1048576).toFixed(1)} MB; el máximo es ${MAX_BYTES / 1048576} MB.` }

  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await archivo.arrayBuffer())
  } catch {
    return { fatal: 'No se pudo leer el archivo: no es un .xlsx válido o está dañado.' }
  }
  const ws = wb.getWorksheet(HOJA) ?? wb.worksheets.find((w) => w.state === 'visible')
  if (!ws) return { fatal: 'El archivo no tiene hojas con datos.' }

  // Encabezados → campos, por etiqueta normalizada (tolera "*", acentos, mayúsculas).
  const avisos: string[] = []
  const porColumna = new Map<number, Campo>()
  const vistos = new Set<Clave>()
  const porEtiqueta = new Map(ESQUEMA.map((c) => [normalizar(c.etiqueta), c]))
  ws.getRow(1).eachCell((cell, n) => {
    const texto = String(valorCelda(cell.value) ?? '')
    const k = normalizar(texto.replace(/\*/g, '').replace(/\(obligatori[oa]\)/i, ''))
    if (!k || k === normalizar(COL_ERRORES)) return
    const c = porEtiqueta.get(k)
    if (!c) return void avisos.push(`Se ignoró la columna «${texto}»: no existe en la tabla de facturas.`)
    if (vistos.has(c.clave)) return void avisos.push(`La columna «${c.etiqueta}» aparece dos veces; se usó la primera.`)
    vistos.add(c.clave)
    porColumna.set(n, c)
  })
  const faltan = ESQUEMA.filter((c) => c.requerido && !vistos.has(c.clave)).map((c) => c.etiqueta)
  if (faltan.length)
    return { fatal: `Faltan columnas obligatorias: ${faltan.join(', ')}. Descarga la plantilla y copia tus datos en ella sin cambiar los encabezados.` }
  for (const c of ESQUEMA) if (!c.requerido && !vistos.has(c.clave)) avisos.push(`No viene la columna opcional «${c.etiqueta}»; se tomará vacía.`)

  const rev: Revision = { leidas: 0, validas: [], errores: [], filasConError: [], avisos }
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const bruto: Partial<Record<Clave, unknown>> = {}
    for (const [n, c] of porColumna) {
      const v = valorCelda(row.getCell(n).value)
      if (!(v == null || (typeof v === 'string' && v.trim() === ''))) bruto[c.clave] = v
    }
    if (Object.keys(bruto).length === 0) continue // fila vacía
    rev.leidas++
    if (rev.leidas > MAX_FILAS)
      return { fatal: `El archivo trae más de ${MAX_FILAS} filas con datos. Divídelo en varios archivos.` }
    const res = validar(bruto)
    if (res.ok) rev.validas.push({ fila: r, valor: res.valor })
    else {
      const mensajes: string[] = []
      for (const e of res.errores) {
        const etiqueta = ESQUEMA.find((c) => c.clave === e.clave)!.etiqueta
        rev.errores.push({ fila: r, etiqueta, valor: mostrar(bruto[e.clave]), mensaje: e.mensaje })
        mensajes.push(`${etiqueta}: ${e.mensaje}`)
      }
      rev.filasConError.push({ fila: r, bruto, mensajes })
    }
  }
  if (rev.leidas === 0) return { fatal: `La hoja «${ws.name}» no tiene filas con datos debajo de los encabezados.` }
  return rev
}
