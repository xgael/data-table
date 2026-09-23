// Esquema de captura de facturas: el espejo de db/facturas.sql. De aquí salen el
// formulario, la plantilla .xlsx (con sus listas y reglas de Excel) y el
// validador de la carga masiva. Una sola fuente: si la tabla cambia, cambia aquí
// y `npm run check` compara ambos.
//
// Las reglas de Excel ayudan, pero se saltan pegando valores: este validador es
// el que decide, y en producción el servidor corre el mismo antes de insertar.
import { CATEGORIA_LABELS, RESPONSABLES, type CategoriaCodigo, type NuevaFactura } from './facturas.ts'

export type Clave = keyof NuevaFactura

export type Campo = {
  clave: Clave
  columna: string // columna en la tabla
  etiqueta: string
  tipo: 'texto' | 'numero' | 'fecha' | 'opcion'
  requerido: boolean
  /** texto: longitud máxima · número: valor máximo */
  max?: number
  /** número: mínimo; `minExclusivo` = "mayor que" (CHECK monto > 0) */
  min?: number
  minExclusivo?: boolean
  opciones?: () => readonly string[]
  largo?: boolean
  ayuda: string
  ejemplo: string
}

// numeric(12,2): 10 dígitos enteros.
export const MAX_NUMERIC_12_2 = 9_999_999_999.99

export const ESQUEMA: readonly Campo[] = [
  { clave: 'cliente', columna: 'cliente', etiqueta: 'Cliente', tipo: 'texto', requerido: true, max: 120, ayuda: 'Razón social o nombre comercial.', ejemplo: 'Café Ñandú' },
  { clave: 'categoria', columna: 'categoria', etiqueta: 'Categoría', tipo: 'opcion', requerido: true, opciones: () => Object.values(CATEGORIA_LABELS), ayuda: 'Elige de la lista.', ejemplo: 'Cámara y foto' },
  { clave: 'monto', columna: 'monto', etiqueta: 'Monto', tipo: 'numero', requerido: true, min: 0, minExclusivo: true, max: MAX_NUMERIC_12_2, ayuda: 'Pesos, mayor que 0, hasta 2 decimales.', ejemplo: '12500.00' },
  { clave: 'anticipo', columna: 'anticipo', etiqueta: 'Anticipo', tipo: 'numero', requerido: false, min: 0, max: MAX_NUMERIC_12_2, ayuda: 'Opcional. No puede ser mayor que el monto.', ejemplo: '2500.00' },
  { clave: 'emision', columna: 'emision', etiqueta: 'Emisión', tipo: 'fecha', requerido: true, ayuda: 'Fecha de la factura.', ejemplo: '15/09/2026' },
  { clave: 'vence', columna: 'vence', etiqueta: 'Vence', tipo: 'fecha', requerido: false, ayuda: 'Opcional; vacío = de contado. No antes de la emisión.', ejemplo: '15/10/2026' },
  { clave: 'responsable', columna: 'responsable_id', etiqueta: 'Responsable', tipo: 'opcion', requerido: true, opciones: () => RESPONSABLES, ayuda: 'Usuario que da seguimiento. Elige de la lista.', ejemplo: 'Sofía Garza' },
  { clave: 'notas', columna: 'notas', etiqueta: 'Notas', tipo: 'texto', requerido: false, max: 500, largo: true, ayuda: 'Opcional, hasta 500 caracteres.', ejemplo: 'Pago en dos exhibiciones.' },
]

export const MAX_FILAS = 1000
export const MAX_BYTES = 5 * 1024 * 1024
export const VERSION_PLANTILLA = 'plantilla:facturas:v1'

export const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── Lectores por tipo: aceptan lo que manda un <input> (texto) y lo que manda
// una celda de Excel (number, Date, texto). Devuelven valor normalizado o error.
type Lectura<T> = { valor: T | null } | { error: string }

const vacio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

function leerNumero(v: unknown): Lectura<number> {
  if (vacio(v)) return { valor: null }
  let n: number
  if (typeof v === 'number') n = v
  else {
    // "$12,500.50", "12 500.50", "12500" → número. Coma = miles (es-MX).
    const s = String(v).trim().replace(/^\$\s*/, '').replace(/[\s,]/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { error: `«${String(v).slice(0, 40)}» no es un número` }
    n = Number(s)
  }
  if (!Number.isFinite(n)) return { error: 'no es un número' }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { error: 'máximo 2 decimales' }
  return { valor: Math.round(n * 100) / 100 }
}

const pad = (n: number) => String(n).padStart(2, '0')
function isoValida(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  if (y < 2000 || y > 2100) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

function leerFecha(v: unknown): Lectura<string> {
  if (vacio(v)) return { valor: null }
  // Excel guarda fechas como días; ExcelJS las entrega como Date a medianoche UTC.
  // Leerlas en hora local corre el día en México: siempre getUTC*.
  if (v instanceof Date) {
    const iso = isNaN(+v) ? null : isoValida(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
    return iso ? { valor: iso } : { error: 'fecha inválida' }
  }
  if (typeof v === 'number') {
    // Serial de Excel (celda con formato General): días desde 1899-12-30.
    const dt = new Date(Math.round((v - 25569) * 86400000))
    const iso = isoValida(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
    return iso ? { valor: iso } : { error: 'fecha inválida' }
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const iso = isoValida(+m[1], +m[2], +m[3])
    return iso ? { valor: iso } : { error: `«${s}» no es una fecha que exista` }
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/) // dd/mm/aaaa (México)
  if (m) {
    const iso = isoValida(+m[3], +m[2], +m[1])
    return iso ? { valor: iso } : { error: `«${s}» no es una fecha que exista` }
  }
  return { error: `«${s.slice(0, 40)}» no es una fecha (usa dd/mm/aaaa)` }
}

function leerOpcion(v: unknown, opciones: readonly string[]): Lectura<string> {
  if (vacio(v)) return { valor: null }
  const k = normalizar(v)
  const hit = opciones.find((o) => normalizar(o) === k)
  if (hit) return { valor: hit }
  const lista = opciones.length <= 6 ? `: ${opciones.join(', ')}` : ''
  return { error: `«${String(v).slice(0, 40)}» no está en la lista${lista}` }
}

function leerTexto(v: unknown, max?: number): Lectura<string> {
  if (vacio(v)) return { valor: null }
  const s = String(v).trim()
  // Se rechaza, no se recorta: truncar en silencio cambia el dato de la persona.
  if (max && s.length > max) return { error: `máximo ${max} caracteres (tiene ${s.length})` }
  return { valor: s }
}

export type ErrorCampo = { clave: Clave; mensaje: string }
export type Resultado = { ok: true; valor: NuevaFactura } | { ok: false; errores: ErrorCampo[] }

const CODIGO_CATEGORIA = Object.fromEntries(
  Object.entries(CATEGORIA_LABELS).map(([k, l]) => [l, k]),
) as Record<string, CategoriaCodigo>

export function validar(entrada: Partial<Record<Clave, unknown>>): Resultado {
  const errores: ErrorCampo[] = []
  const v: Partial<Record<Clave, string | number | null>> = {}

  for (const c of ESQUEMA) {
    const bruto = entrada[c.clave]
    const r =
      c.tipo === 'numero' ? leerNumero(bruto)
      : c.tipo === 'fecha' ? leerFecha(bruto)
      : c.tipo === 'opcion' ? leerOpcion(bruto, c.opciones!())
      : leerTexto(bruto, c.max)
    if ('error' in r) { errores.push({ clave: c.clave, mensaje: r.error }); continue }
    if (r.valor == null) {
      if (c.requerido) errores.push({ clave: c.clave, mensaje: 'es obligatorio' })
      v[c.clave] = null
      continue
    }
    if (c.tipo === 'numero') {
      const n = r.valor as number
      if (c.min != null && (c.minExclusivo ? n <= c.min : n < c.min)) {
        errores.push({ clave: c.clave, mensaje: c.minExclusivo ? `debe ser mayor que ${c.min}` : `no puede ser menor que ${c.min}` })
        continue
      }
      if (c.max != null && n > c.max) { errores.push({ clave: c.clave, mensaje: 'excede el máximo permitido' }); continue }
    }
    v[c.clave] = r.valor
  }

  // Reglas entre campos (los CHECK que miran dos columnas)
  if (typeof v.anticipo === 'number' && typeof v.monto === 'number' && v.anticipo > v.monto)
    errores.push({ clave: 'anticipo', mensaje: 'no puede ser mayor que el monto' })
  if (typeof v.vence === 'string' && typeof v.emision === 'string' && v.vence < v.emision)
    errores.push({ clave: 'vence', mensaje: 'no puede ser antes de la emisión' })

  if (errores.length) return { ok: false, errores }
  return {
    ok: true,
    valor: {
      cliente: v.cliente as string,
      categoria: CODIGO_CATEGORIA[v.categoria as string],
      monto: (v.monto as number).toFixed(2),
      anticipo: v.anticipo == null ? null : (v.anticipo as number).toFixed(2),
      emision: v.emision as string,
      vence: (v.vence as string | null) ?? null,
      responsable: v.responsable as string,
      notas: (v.notas as string | null) ?? null,
    },
  }
}

export const campo = (clave: Clave) => ESQUEMA.find((c) => c.clave === clave)!
