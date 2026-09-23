import type { RowData } from '@tanstack/react-table'
import type { Columna, MetaColumna } from './tabla'

// CSV. Síncrono en el gesto (sin await antes del click del <a>), con BOM para
// que Excel lea los acentos, y neutralizando fórmulas: una celda que empieza
// con = + - @ (o tab/CR) se EJECUTA al abrir el archivo en Excel o Sheets.
export function celdaCsv(v: unknown): string {
  let s = String(v ?? '')
  // Un número puro (-500, 1.5) no ejecuta nada: prefijarlo lo volvería texto en Excel.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function construirCsv<T extends RowData>(columnas: Columna<T>[], filas: T[]): string {
  const cols = columnas.filter((c) => typeof c.header === 'string' && c.header)
  const valor = (c: Columna<T>, r: T) => {
    const meta = c.meta as MetaColumna | undefined
    if (meta?.csv) return (meta.csv as (r: T) => string)(r)
    const fn = (c as { accessorFn?: (r: T, i: number) => unknown }).accessorFn
    return fn ? fn(r, 0) : ''
  }
  return [
    cols.map((c) => celdaCsv(c.header)).join(','),
    ...filas.map((r) => cols.map((c) => celdaCsv(valor(c, r))).join(',')),
  ].join('\r\n')
}

export function descargarCsv<T extends RowData>(nombre: string, columnas: Columna<T>[], filas: T[]) {
  const blob = new Blob(['\uFEFF' + construirCsv(columnas, filas)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}
