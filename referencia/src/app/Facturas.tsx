'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionsMenu, type ItemMenu } from '@/components/ActionsMenu'
import { DataTable, type EstadoTabla, type TablaApi } from '@/components/DataTable'
import { Drawer } from '@/components/Drawer'
import { AvisosToaster } from '@/components/AvisosToaster'
import { avisar } from '@/lib/avisos'
import { CrearFacturas, type Pestana } from './CrearFacturas'
import {
  cargarFacturas,
  crearFacturas,
  CATEGORIA_LABELS,
  ESCENARIOS,
  ESTADO_LABELS,
  ESTADO_RANK,
  puede,
  puedeCrear,
  ROL_LABELS,
  type Escenario,
  type Factura,
  type NuevaFactura,
  type Rol,
} from '@/lib/facturas'
import { colEnum, colFecha, colNumero, descargarCsv, dia, dinero, type Columna } from '@/lib/tabla'
import { escribirVista, type Vista } from '@/lib/url'
import styles from './Facturas.module.css'

const ESCENARIO_LABELS: Record<Escenario, string> = {
  normal: 'Normal (137 facturas)',
  vacio: 'Sin ninguna factura',
  error: 'El servidor falla',
  lento: 'Red lenta',
}
const SIN_FACTURAS: Factura[] = []

export function Facturas({ inicial }: { inicial: Vista }) {
  return (
    <>
      <AvisosToaster />
      <Pantalla inicial={inicial} />
    </>
  )
}

function Pantalla({ inicial }: { inicial: Vista }) {
  const [tabla, setTabla] = useState<EstadoTabla>(inicial.tabla)
  const [rol, setRol] = useState<Rol>(inicial.rol)
  const [escenario, setEscenario] = useState<Escenario>(inicial.escenario)
  const [data, setData] = useState<Factura[]>(SIN_FACTURAS)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [ultimoId, setUltimoId] = useState<string | null>(null) // a quién regresa el foco
  const [crear, setCrear] = useState<Pestana | null>(null)

  const setEstado = useCallback((parcial: Partial<EstadoTabla>) => setTabla((t) => ({ ...t, ...parcial })), [])

  // Carga. `cargando` se enciende en el evento que la pide (recargar), no aquí.
  const recargar = useCallback((esc: Escenario) => {
    setCargando(true)
    setError(null)
    setEscenario(esc)
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    let vivo = true
    cargarFacturas(escenario)
      .then((xs) => vivo && setData(xs))
      .catch((e: Error) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [escenario, intento])

  // Estado → URL (reemplaza la entrada: filtrar no llena el historial)
  useEffect(() => {
    window.history.replaceState(null, '', escribirVista({ tabla, rol, escenario }))
  }, [tabla, rol, escenario])

  // ── Mutaciones optimistas con Deshacer. Se guarda la versión previa de cada
  // fila tocada, por id; deshacer la restaura sin pisar cambios a otras filas.
  const mutar = useCallback(
    (ids: string[], cambio: (f: Factura) => Factura | null, mensaje: string, borra = false) => {
      const previas = new Map<string, { f: Factura; i: number }>()
      setData((xs) => {
        const out: Factura[] = []
        xs.forEach((f, i) => {
          if (!ids.includes(f.id)) return void out.push(f)
          previas.set(f.id, { f, i })
          const nueva = cambio(f)
          if (nueva) out.push(nueva)
        })
        return out
      })
      // Sólo lo BORRADO sale de la selección (v9 no la limpia sola); pagar o
      // cancelar no deselecciona.
      setTabla((t) => {
        const sel = { ...t.rowSelection }
        if (borra) for (const id of ids) delete sel[id]
        return borra ? { ...t, rowSelection: sel } : t
      })
      avisar({
        titulo: mensaje,
        deshacer: () =>
          setData((xs) => {
            const vivas = xs.filter((f) => !previas.has(f.id))
            const restaurar = [...previas.values()].sort((a, b) => a.i - b.i)
            for (const { f, i } of restaurar) vivas.splice(Math.min(i, vivas.length), 0, f)
            return vivas
          }),
      })
    },
    [],
  )

  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
  const registrarPago = useCallback(
    (fs: Factura[]) => mutar(fs.map((f) => f.id), (f) => ({ ...f, estado: 'pagada' }), `Pago registrado en ${plural(fs.length, 'factura', 'facturas')}`),
    [mutar],
  )
  const cancelar = useCallback(
    (fs: Factura[]) => mutar(fs.map((f) => f.id), (f) => ({ ...f, estado: 'cancelada' }), `${plural(fs.length, 'factura cancelada', 'facturas canceladas')}`),
    [mutar],
  )
  const eliminar = useCallback(
    (fs: Factura[]) => {
      if (fs.some((f) => f.id === detalleId)) setDetalleId(null)
      mutar(fs.map((f) => f.id), () => null, `${plural(fs.length, 'factura eliminada', 'facturas eliminadas')}`, true)
    },
    [mutar, detalleId],
  )

  // Alta (formulario o carga masiva). Devuelve los folios para el aviso.
  const alta = (nuevas: NuevaFactura[]): string[] => {
    const creadas = crearFacturas(nuevas, data)
    const ids = new Set(creadas.map((f) => f.id))
    setData((xs) => [...creadas, ...xs])
    avisar({
      titulo: creadas.length === 1 ? `Factura ${creadas[0].folio} creada` : `${creadas.length} facturas importadas`,
      deshacer: () => setData((xs) => xs.filter((f) => !ids.has(f.id))),
    })
    return creadas.map((f) => f.folio)
  }

  const abrirDetalle = useCallback((f: Factura) => {
    setUltimoId(f.id)
    setDetalleId(f.id)
  }, [])

  // Una sola lista de acciones por factura: la usan el menú ⋯ y el pie del drawer.
  const accionesDe = useCallback(
    (f: Factura, conDetalle: boolean): ItemMenu[] => [
      { label: 'Ver detalle', onSelect: () => abrirDetalle(f), oculta: !conDetalle },
      {
        label: 'Copiar folio',
        onSelect: () => {
          navigator.clipboard?.writeText(f.folio).catch(() => {})
          avisar({ titulo: `Folio ${f.folio} copiado` })
        },
      },
      { label: 'Registrar pago', onSelect: () => registrarPago([f]), oculta: !puede(rol, 'registrarPago', f) },
      { label: 'Cancelar factura', onSelect: () => cancelar([f]), oculta: !puede(rol, 'cancelar', f) },
      { label: 'Eliminar', onSelect: () => eliminar([f]), destructiva: true, oculta: !puede(rol, 'eliminar', f) },
    ],
    [rol, abrirDetalle, registrarPago, cancelar, eliminar],
  )

  const columnas = useMemo<Columna<Factura>[]>(
    () => [
      {
        id: 'folio',
        header: 'Folio',
        accessorFn: (r) => r.folio,
        // El folio es el disparador accesible del detalle (la fila entera también
        // es clicable, pero una <tr> no se alcanza con teclado).
        cell: ({ row }) => (
          <button type="button" className={styles.folio} data-folio={row.original.id} onClick={() => abrirDetalle(row.original)}>
            {row.original.folio}
          </button>
        ),
        meta: { ancho: '128px' },
      },
      { id: 'cliente', header: 'Cliente', accessorFn: (r) => r.cliente, meta: { ancho: '200px' } },
      colEnum({ id: 'categoria', header: 'Categoría', get: (r: Factura) => r.categoria, labels: CATEGORIA_LABELS }),
      colEnum({ id: 'estado', header: 'Estado', get: (r: Factura) => r.estado, labels: ESTADO_LABELS, rank: ESTADO_RANK, badge: true }),
      colNumero({ id: 'monto', header: 'Monto', get: (r: Factura) => r.monto, nulo: '—' }),
      colNumero({ id: 'anticipo', header: 'Anticipo', get: (r: Factura) => r.anticipo, nulo: 'Sin anticipo' }),
      colFecha({ id: 'emision', header: 'Emisión', get: (r: Factura) => r.emision, nulo: '—' }),
      colFecha({ id: 'vence', header: 'Vence', get: (r: Factura) => r.vence, nulo: 'De contado' }),
      { id: 'responsable', header: 'Responsable', accessorFn: (r) => r.responsable },
      {
        id: 'acciones',
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => <ActionsMenu registro={row.original.folio} items={accionesDe(row.original, true)} />,
        meta: { ancho: '56px' },
      },
    ],
    [abrirDetalle, accionesDe],
  )

  const filtroDe = (id: string) => (tabla.columnFilters.find((f) => f.id === id)?.value as string) ?? ''
  const setFiltro = (id: string, value: string) =>
    setEstado({
      columnFilters: [...tabla.columnFilters.filter((f) => f.id !== id), ...(value ? [{ id, value }] : [])],
      pagination: { ...tabla.pagination, pageIndex: 0 },
      rowSelection: {},
    })

  const detalle = data.find((f) => f.id === detalleId) ?? null

  return (
    <main className={styles.pagina}>
      <aside className={styles.demo} aria-label="Controles de la demostración">
        <span className={styles.demoEtiqueta}>Demo</span>
        <span className={styles.demoCampo}>
          <label htmlFor="d-escenario">Escenario</label>
          <select id="d-escenario" value={escenario} onChange={(e) => { recargar(e.target.value as Escenario); setEstado({ rowSelection: {} }) }}>
            {ESCENARIOS.map((s) => <option key={s} value={s}>{ESCENARIO_LABELS[s]}</option>)}
          </select>
        </span>
        <span className={styles.demoCampo}>
          <label htmlFor="d-rol">Viendo como</label>
          <select id="d-rol" value={rol} onChange={(e) => { setRol(e.target.value as Rol); setEstado({ rowSelection: {} }) }}>
            {(Object.keys(ROL_LABELS) as Rol[]).map((r) => <option key={r} value={r}>{ROL_LABELS[r]}</option>)}
          </select>
        </span>
      </aside>

      <DataTable<Factura>
        titulo="Facturas"
        sustantivo={{ uno: 'factura', varios: 'facturas' }}
        data={data}
        columnas={columnas}
        getRowId={(r) => r.id}
        estado={tabla}
        setEstado={setEstado}
        cargando={cargando}
        error={error}
        onReintentar={() => recargar(escenario === 'error' ? 'normal' : escenario)}
        placeholder="Buscar folio, cliente, categoría, estado…"
        seleccionable
        onFila={abrirDetalle}
        vacio={
          <>
            <p className={styles.vacioTitulo}>Todavía no hay facturas</p>
            <p className={styles.vacioTexto}>Las facturas que emitas aparecerán aquí para darles seguimiento de cobro.</p>
            {puedeCrear(rol) && (
              <div className={styles.vacioAcciones}>
                <button type="button" className={styles.primario} onClick={() => setCrear('una')}>Crear una factura</button>
                <button type="button" className={styles.secundario} onClick={() => setCrear('masiva')}>Importar desde Excel</button>
              </div>
            )}
            <button type="button" className={styles.enlace} onClick={() => recargar('normal')}>
              o carga las facturas de ejemplo (demo)
            </button>
          </>
        }
        filtros={
          <>
            <span className={styles.filtro}>
              <label htmlFor="f-estado">Estado</label>
              <select id="f-estado" value={filtroDe('estado')} onChange={(e) => setFiltro('estado', e.target.value)}>
                <option value="">Todos</option>
                {Object.values(ESTADO_LABELS).map((l) => <option key={l}>{l}</option>)}
              </select>
            </span>
            <span className={styles.filtro}>
              <label htmlFor="f-categoria">Categoría</label>
              <select id="f-categoria" value={filtroDe('categoria')} onChange={(e) => setFiltro('categoria', e.target.value)}>
                <option value="">Todas</option>
                {Object.values(CATEGORIA_LABELS).map((l) => <option key={l}>{l}</option>)}
              </select>
            </span>
          </>
        }
        herramientas={(t) => {
          const filas = t.getSortedRowModel().rows.map((r) => r.original)
          return (
            <>
            <button
              type="button"
              className={styles.secundario}
              disabled={!filas.length}
              onClick={() => descargarCsv('facturas.csv', columnas, filas)}
            >
              Exportar {filas.length === data.length ? 'todo' : plural(filas.length, 'fila', 'filas')} (CSV)
            </button>
            {/* Sin permiso no se muestra (nunca podrá), no se deshabilita */}
            {puedeCrear(rol) && (
              <button type="button" id="btn-nueva" className={styles.primario} onClick={() => setCrear('una')}>
                + Nueva factura
              </button>
            )}
            </>
          )
        }}
        barraSeleccion={(t) => <BarraSeleccion t={t} rol={rol} columnas={columnas} acciones={{ registrarPago, eliminar }} />}
      />

      <CrearFacturas
        pestana={crear}
        onPestana={setCrear}
        onCerrar={() => setCrear(null)}
        onCrear={alta}
        volverA={() => document.getElementById('btn-nueva') ?? document.querySelector<HTMLElement>('[role="region"]')}
      />

      <Drawer
        abierto={!!detalle}
        onCerrar={() => setDetalleId(null)}
        titulo={detalle ? `Factura ${detalle.folio}` : ''}
        subtitulo={detalle && <span className="badge" data-valor={detalle.estado}>{ESTADO_LABELS[detalle.estado]}</span>}
        // Si la fila ya no está en pantalla (se pagó y cambió de página, se
        // eliminó), el foco vuelve a la tabla, no se pierde en <body>.
        volverA={() =>
          document.querySelector<HTMLElement>(`[data-folio="${ultimoId}"]`) ??
          document.querySelector<HTMLElement>('[role="region"]')
        }
        pie={
          detalle &&
          accionesDe(detalle, false)
            .filter((a) => !a.oculta)
            .map((a) => (
              <button key={a.label} type="button" className={a.destructiva ? styles.peligro : styles.secundario} onClick={a.onSelect}>
                {a.label}
              </button>
            ))
        }
      >
        {detalle && (
          <dl className={styles.ficha}>
            <dt>Cliente</dt><dd>{detalle.cliente}</dd>
            <dt>Categoría</dt><dd>{CATEGORIA_LABELS[detalle.categoria]}</dd>
            <dt>Monto</dt><dd className={styles.num}>{dinero(Number(detalle.monto))}</dd>
            <dt>Anticipo</dt><dd className={styles.num}>{detalle.anticipo ? dinero(Number(detalle.anticipo)) : <span className="nulo">Sin anticipo</span>}</dd>
            <dt>Saldo</dt><dd className={styles.num}>{dinero(Number(detalle.monto) - Number(detalle.anticipo ?? 0))}</dd>
            <dt>Emisión</dt><dd>{dia(detalle.emision)}</dd>
            <dt>Vence</dt><dd>{detalle.vence ? dia(detalle.vence) : <span className="nulo">De contado</span>}</dd>
            <dt>Responsable</dt><dd>{detalle.responsable}</dd>
            <dt>Notas</dt><dd>{detalle.notas || <span className="nulo">Sin notas</span>}</dd>
          </dl>
        )}
      </Drawer>
    </main>
  )
}

function BarraSeleccion({
  t,
  rol,
  columnas,
  acciones,
}: {
  t: TablaApi<Factura>
  rol: Rol
  columnas: Columna<Factura>[]
  acciones: { registrarPago: (fs: Factura[]) => void; eliminar: (fs: Factura[]) => void }
}) {
  const sel = t.getSelectedRowModel().rows.map((r) => r.original)
  const filtradas = t.getFilteredRowModel().rows.length
  const paginaCompleta = t.getIsAllPageRowsSelected()
  const pagables = sel.filter((f) => puede(rol, 'registrarPago', f))
  const borrables = sel.filter((f) => puede(rol, 'eliminar', f))
  const n = sel.length

  return (
    <>
      <strong>{n} {n === 1 ? 'seleccionada' : 'seleccionadas'}</strong>
      {paginaCompleta && n < filtradas && (
        <button type="button" className={styles.enlace} onClick={() => t.toggleAllRowsSelected(true)}>
          Seleccionar las {filtradas} que coinciden
        </button>
      )}
      <span className={styles.separador} aria-hidden="true" />
      <button type="button" className={styles.secundario} onClick={() => descargarCsv('facturas-seleccion.csv', columnas, sel)}>
        Exportar {n} (CSV)
      </button>
      {pagables.length > 0 && (
        <button type="button" className={styles.secundario} onClick={() => acciones.registrarPago(pagables)}>
          Registrar pago{pagables.length < n ? ` (${pagables.length} de ${n})` : ''}
        </button>
      )}
      {borrables.length > 0 && (
        <button type="button" className={styles.peligro} onClick={() => acciones.eliminar(borrables)}>
          Eliminar{borrables.length < n ? ` (${borrables.length} de ${n})` : ` ${n}`}
        </button>
      )}
      <button type="button" className={styles.enlace} onClick={() => t.resetRowSelection(true)}>
        Quitar selección
      </button>
    </>
  )
}
