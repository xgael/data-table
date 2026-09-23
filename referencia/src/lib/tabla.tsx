import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  type ColumnDef,
  type FilterFn,
  type RowData,
  type TableFeatures,
} from '@tanstack/react-table'

export type MetaColumna = {
  /** 'end' = números: a la derecha y tabulares (celda Y encabezado). */
  align?: 'end'
  /** Texto para el CSV; si falta, se exporta el valor del accessor. */
  csv?: (row: never) => string
  /** Ancho fijo de la columna (CSS). */
  ancho?: string
}

// Normaliza para buscar "lo que se ve": sin acentos, sin mayúsculas.
export const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const contiene: FilterFn<TableFeatures, RowData> = (row, columnId, filtro: string) =>
  normalizar(row.getValue(columnId)).includes(filtro)
contiene.resolveFilterValue = (v) => normalizar(v)
contiene.autoRemove = (v) => !v

const igual: FilterFn<TableFeatures, RowData> = (row, columnId, filtro: string) => row.getValue(columnId) === filtro
igual.autoRemove = (v) => !v

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { contiene, igual },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  columnMeta: metaHelper<MetaColumna>(),
})
export type F = typeof features
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada columna tiene su TValue; el arreglo las mezcla
export type Columna<T extends RowData> = ColumnDef<F, T, any>

// ── Formato. Las fechas `date` son días, no instantes: se leen y se pintan en
// UTC. Leerlas en hora local corre el día en husos negativos (México).
const fmtDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const fmtDia = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const dinero = (n: number) => fmtDinero.format(n)
export const dia = (iso: string) => fmtDia.format(new Date(`${iso}T00:00:00Z`)).replace('.', '')
export const instanteDia = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

// ── Columnas por tipo: el accessor decide (ordena y busca), el cell decora.
// NULL va SIEMPRE al final (sortUndefined), en asc y en desc, y se rotula.

export function colNumero<T extends RowData>(o: {
  id: string
  header: string
  get: (r: T) => string | number | null
  fmt?: (n: number) => string
  nulo: string
}): Columna<T> {
  const fmt = o.fmt ?? dinero
  return {
    id: o.id,
    header: o.header,
    accessorFn: (r) => {
      const v = o.get(r)
      return v == null ? undefined : Number(v)
    },
    sortUndefined: 'last',
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const v = o.get(row.original)
      return v == null ? <span className="nulo">{o.nulo}</span> : fmt(Number(v))
    },
    meta: { align: 'end', csv: ((r: T) => (o.get(r) == null ? '' : String(Number(o.get(r))))) as never },
  }
}

export function colFecha<T extends RowData>(o: {
  id: string
  header: string
  get: (r: T) => string | null
  nulo: string
}): Columna<T> {
  return {
    id: o.id,
    header: o.header,
    accessorFn: (r) => {
      const v = o.get(r)
      return v ? instanteDia(v) : undefined
    },
    sortUndefined: 'last',
    enableGlobalFilter: false,
    cell: ({ row }) => {
      const v = o.get(row.original)
      return v ? dia(v) : <span className="nulo">{o.nulo}</span>
    },
    meta: { csv: ((r: T) => o.get(r) ?? '') as never },
  }
}

export function colEnum<T extends RowData, K extends string>(o: {
  id: string
  header: string
  get: (r: T) => K
  labels: Record<K, string>
  rank?: Record<K, number>
  badge?: boolean
}): Columna<T> {
  const rank = o.rank
  return {
    id: o.id,
    header: o.header,
    accessorFn: (r) => o.labels[o.get(r)] ?? o.get(r), // busca y filtra por lo que se ve
    filterFn: 'igual',
    ...(rank && { sortFn: (a, b) => rank[o.get(a.original)] - rank[o.get(b.original)] }),
    cell: ({ row }) => {
      const k = o.get(row.original)
      const txt = o.labels[k] ?? k
      return o.badge ? <span className="badge" data-valor={k}>{txt}</span> : txt
    },
  }
}

export { descargarCsv } from './csv'
