'use client'

import {
  useTable,
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { useEffect, useId, useMemo, type ReactNode } from 'react'
import { features, type Columna, type MetaColumna } from '@/lib/tabla'
import styles from './DataTable.module.css'

export type EstadoTabla = {
  sorting: SortingState
  globalFilter: string
  columnFilters: ColumnFiltersState
  pagination: PaginationState
  rowSelection: RowSelectionState
}

export type TablaApi<T extends RowData> = ReturnType<typeof useTable<typeof features, T>>

type Props<T extends RowData> = {
  titulo: string
  sustantivo: { uno: string; varios: string }
  data: T[]
  columnas: Columna<T>[]
  getRowId: (r: T) => string
  estado: EstadoTabla
  setEstado: (parcial: Partial<EstadoTabla>) => void
  cargando: boolean
  error: string | null
  onReintentar: () => void
  /** Vacío-primerizo: no hay NINGÚN registro todavía (≠ sin resultados). */
  vacio: ReactNode
  placeholder: string
  seleccionable?: boolean
  filtros?: ReactNode
  herramientas?: (t: TablaApi<T>) => ReactNode
  barraSeleccion?: (t: TablaApi<T>) => ReactNode
  onFila?: (r: T) => void
}

const TAMANOS = [25, 50, 100]
const resolver = <V,>(u: Updater<V>, previo: V): V => (typeof u === 'function' ? (u as (p: V) => V)(previo) : u)

export function DataTable<T extends RowData>(p: Props<T>) {
  const { estado, setEstado } = p
  const idTitulo = useId()
  const idConteo = useId()
  const idTamano = useId()

  const columnas = useMemo<Columna<T>[]>(() => {
    if (!p.seleccionable) return p.columnas
    const sel: Columna<T> = {
      id: '_sel',
      header: ({ table }) => {
        const todas = table.getIsAllPageRowsSelected()
        return (
          <input
            type="checkbox"
            aria-label="Seleccionar todas las filas de esta página"
            checked={todas}
            // v9: getIsSome… es "al menos una", incluso con todas → combinar
            ref={(el) => { if (el) el.indeterminate = table.getIsSomePageRowsSelected() && !todas }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        )
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Seleccionar ${p.getRowId(row.original)}`}
          checked={row.getIsSelected()}
          onClick={(e) => { e.stopPropagation(); row.getToggleSelectedHandler()(e) }}
          onChange={() => {}}
        />
      ),
      enableSorting: false,
      meta: { ancho: '44px' },
    }
    return [sel, ...p.columnas]
  }, [p.columnas, p.seleccionable]) // eslint-disable-line react-hooks/exhaustive-deps

  const table = useTable({
    features,
    columns: columnas,
    data: p.data,
    getRowId: p.getRowId,
    state: estado,
    globalFilterFn: 'contiene',
    enableSortingRemoval: false,
    autoResetPageIndex: false, // editar una fila no te regresa a la página 1
    enableRowSelection: !!p.seleccionable,
    onSortingChange: (u) => setEstado({ sorting: resolver(u, estado.sorting), pagination: { ...estado.pagination, pageIndex: 0 } }),
    // Cambiar búsqueda o filtros: página 1 y selección limpia (una selección que
    // el filtro esconde es una acción masiva sobre filas que no ves).
    onGlobalFilterChange: (u) =>
      setEstado({ globalFilter: resolver(u, estado.globalFilter) ?? '', pagination: { ...estado.pagination, pageIndex: 0 }, rowSelection: {} }),
    onColumnFiltersChange: (u) =>
      setEstado({ columnFilters: resolver(u, estado.columnFilters), pagination: { ...estado.pagination, pageIndex: 0 }, rowSelection: {} }),
    onPaginationChange: (u) => setEstado({ pagination: resolver(u, estado.pagination) }),
    onRowSelectionChange: (u) => setEstado({ rowSelection: resolver(u, estado.rowSelection) }),
  })

  const total = p.data.length
  const filtradas = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const { pageIndex, pageSize } = estado.pagination

  // Si se borraron filas y la página actual quedó fuera, ir a la última que existe.
  useEffect(() => {
    if (pageCount > 0 && pageIndex > pageCount - 1) setEstado({ pagination: { pageIndex: pageCount - 1, pageSize } })
  }, [pageCount, pageIndex, pageSize, setEstado])

  const hayFiltro = !!estado.globalFilter || estado.columnFilters.length > 0
  const limpiar = () => setEstado({ globalFilter: '', columnFilters: [], pagination: { pageIndex: 0, pageSize }, rowSelection: {} })
  const nombre = (n: number) => (n === 1 ? p.sustantivo.uno : p.sustantivo.varios)
  const ncols = table.getAllLeafColumns().length
  const filas = table.getRowModel().rows
  const desde = filtradas === 0 ? 0 : pageIndex * pageSize + 1
  const hasta = Math.min(filtradas, (pageIndex + 1) * pageSize)

  let cuerpo: ReactNode
  if (p.cargando) {
    cuerpo = Array.from({ length: 10 }, (_, i) => (
      <tr key={i} className={styles.esqueleto} aria-hidden="true">
        {Array.from({ length: ncols }, (_, j) => (
          <td key={j}><span className={styles.barra} /></td>
        ))}
      </tr>
    ))
  } else if (p.error) {
    cuerpo = (
      <tr>
        <td colSpan={ncols} className={styles.estado}>
          <p className={styles.estadoTitulo}>No se pudieron cargar las {p.sustantivo.varios}</p>
          <p className={styles.estadoTexto}>{p.error}</p>
          <button type="button" className={styles.boton} onClick={p.onReintentar}>Reintentar</button>
        </td>
      </tr>
    )
  } else if (total === 0) {
    cuerpo = (
      <tr>
        <td colSpan={ncols} className={styles.estado}>{p.vacio}</td>
      </tr>
    )
  } else if (filtradas === 0) {
    cuerpo = (
      <tr>
        <td colSpan={ncols} className={styles.estado}>
          <p className={styles.estadoTitulo}>Sin resultados</p>
          <p className={styles.estadoTexto}>
            Ninguna de las {total} {nombre(total)} coincide
            {estado.globalFilter ? <> con «{estado.globalFilter}»</> : null}
            {estado.columnFilters.length ? ' y los filtros activos' : ''}.
          </p>
          <button type="button" className={styles.boton} onClick={limpiar}>Limpiar búsqueda y filtros</button>
        </td>
      </tr>
    )
  } else {
    cuerpo = filas.map((row) => (
      <tr
        key={row.id}
        data-seleccionada={row.getIsSelected() || undefined}
        className={p.onFila ? styles.filaClicable : undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, input, select, label')) return
          p.onFila?.(row.original)
        }}
      >
        {row.getAllCells().map((cell) => {
          const meta = cell.column.columnDef.meta as MetaColumna | undefined
          return (
            <td key={cell.id} className={meta?.align === 'end' ? styles.fin : undefined}>
              <table.FlexRender cell={cell} />
            </td>
          )
        })}
      </tr>
    ))
  }

  const chips = [
    ...(estado.globalFilter ? [{ id: '_q', texto: `Búsqueda: ${estado.globalFilter}`, quitar: () => table.setGlobalFilter('') }] : []),
    ...estado.columnFilters.map((f) => {
      const col = table.getColumn(f.id)
      const header = typeof col?.columnDef.header === 'string' ? col.columnDef.header : f.id
      return { id: f.id, texto: `${header}: ${String(f.value)}`, quitar: () => col?.setFilterValue(undefined) }
    }),
  ]

  return (
    <section className={styles.contenedor} aria-labelledby={idTitulo}>
      <div className={styles.barra1}>
        <h1 id={idTitulo} className={styles.titulo}>{p.titulo}</h1>
        <p id={idConteo} className={styles.conteo} aria-live="polite">
          {p.cargando ? 'Cargando…' : hayFiltro ? `${filtradas} de ${total} ${nombre(total)}` : `${total} ${nombre(total)}`}
        </p>
        <div className={styles.herramientas}>{p.herramientas?.(table)}</div>
      </div>

      <div className={styles.barra2}>
        <label className={styles.buscar}>
          <span className="sr-only">Buscar en {p.sustantivo.varios}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            placeholder={p.placeholder}
            maxLength={100}
            value={estado.globalFilter}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
          />
        </label>
        {p.filtros}
      </div>

      {chips.length > 0 && (
        <div className={styles.chips} aria-label="Filtros activos">
          {chips.map((c) => (
            <button key={c.id} type="button" className={styles.chip} onClick={c.quitar} aria-label={`Quitar ${c.texto}`}>
              {c.texto} <span aria-hidden="true">×</span>
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" className={styles.limpiar} onClick={limpiar}>Limpiar todo</button>
          )}
        </div>
      )}

      {p.barraSeleccion && Object.keys(estado.rowSelection).length > 0 && (
        <div className={styles.seleccion}>{p.barraSeleccion(table)}</div>
      )}

      <div className={styles.scroll} role="region" aria-labelledby={idTitulo} tabIndex={0}>
        <table className={styles.tabla} aria-describedby={idConteo} aria-busy={p.cargando || undefined}>
          <caption className="sr-only">{p.titulo}</caption>
          <colgroup>
            {table.getAllLeafColumns().map((c) => {
              const meta = c.columnDef.meta as MetaColumna | undefined
              return <col key={c.id} style={meta?.ancho ? { width: meta.ancho } : undefined} />
            })}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => {
                  const meta = h.column.columnDef.meta as MetaColumna | undefined
                  const dir = h.column.getIsSorted()
                  const principal = estado.sorting[0]?.id === h.column.id
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      className={meta?.align === 'end' ? styles.fin : undefined}
                      aria-sort={principal && dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" className={styles.orden} onClick={h.column.getToggleSortingHandler()}>
                          <table.FlexRender header={h} />
                          <span className={styles.flecha} data-dir={dir || undefined} aria-hidden="true">
                            {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={h} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>{cuerpo}</tbody>
        </table>
      </div>

      <nav className={styles.paginacion} aria-label="Paginación">
        <span className={styles.tamano}>
          <label htmlFor={idTamano}>Filas por página</label>
          <select id={idTamano} value={pageSize} onChange={(e) => setEstado({ pagination: { pageIndex: 0, pageSize: Number(e.target.value) } })}>
            {TAMANOS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
        <span className={styles.rango} data-rango>
          {desde}–{hasta} de {filtradas}
        </span>
        <div className={styles.paginas}>
          <button type="button" aria-label="Primera página" onClick={() => table.firstPage()} disabled={!table.getCanPreviousPage()}>«</button>
          <button type="button" aria-label="Página anterior" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>‹</button>
          <span className={styles.pagina} data-pagina>Página {pageCount ? pageIndex + 1 : 0} de {pageCount}</span>
          <button type="button" aria-label="Página siguiente" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>›</button>
          <button type="button" aria-label="Última página" onClick={() => table.lastPage()} disabled={!table.getCanNextPage()}>»</button>
        </div>
      </nav>
    </section>
  )
}
