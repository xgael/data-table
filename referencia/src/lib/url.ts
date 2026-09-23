// Estado de la tabla ↔ URL. La URL es entrada pública: cada valor se valida
// contra su dominio y lo que no encaja se ignora (no se "corrige").
import type { EstadoTabla } from '@/components/DataTable'
import { CATEGORIA_LABELS, ESCENARIOS, ESTADO_LABELS, ROL_LABELS, type Escenario, type Rol } from './facturas'

export type Vista = { tabla: EstadoTabla; rol: Rol; escenario: Escenario }

const COLUMNAS_ORDENABLES = ['folio', 'cliente', 'categoria', 'estado', 'monto', 'anticipo', 'emision', 'vence', 'responsable']
const TAMANOS = [25, 50, 100]
// Orden por defecto = la tarea de cobranza: lo vencido primero, y dentro, lo que vence antes.
export const ORDEN_DEFECTO = [{ id: 'estado', desc: false }, { id: 'vence', desc: false }]

type SP = Record<string, string | string[] | undefined>
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function leerVista(sp: SP): Vista {
  const q = (uno(sp.q) ?? '').slice(0, 100)
  const estado = uno(sp.estado)
  const categoria = uno(sp.categoria)
  const columnFilters = [
    ...(estado && Object.values(ESTADO_LABELS).includes(estado) ? [{ id: 'estado', value: estado }] : []),
    ...(categoria && Object.values(CATEGORIA_LABELS).includes(categoria) ? [{ id: 'categoria', value: categoria }] : []),
  ]
  const orden = uno(sp.orden)
  const sorting = orden
    ? orden
        .split(',')
        .map((s) => ({ id: s.replace(/^-/, ''), desc: s.startsWith('-') }))
        .filter((s) => COLUMNAS_ORDENABLES.includes(s.id))
        .slice(0, 2)
    : ORDEN_DEFECTO
  const tam = Number(uno(sp.tam))
  const pageSize = TAMANOS.includes(tam) ? tam : 25
  const pag = Number.parseInt(uno(sp.pagina) ?? '1', 10)
  const rol = uno(sp.rol) as Rol
  const esc = uno(sp.demo) as Escenario
  return {
    tabla: {
      globalFilter: q,
      columnFilters,
      sorting: sorting.length ? sorting : ORDEN_DEFECTO,
      pagination: { pageIndex: Number.isFinite(pag) && pag > 1 && pag < 10000 ? pag - 1 : 0, pageSize },
      rowSelection: {},
    },
    rol: rol in ROL_LABELS ? rol : 'admin',
    escenario: ESCENARIOS.includes(esc) ? esc : 'normal',
  }
}

export function escribirVista(v: Vista): string {
  const p = new URLSearchParams()
  const t = v.tabla
  if (t.globalFilter) p.set('q', t.globalFilter)
  for (const f of t.columnFilters) p.set(f.id, String(f.value))
  const orden = t.sorting.map((s) => (s.desc ? '-' : '') + s.id).join(',')
  if (orden !== ORDEN_DEFECTO.map((s) => (s.desc ? '-' : '') + s.id).join(',')) p.set('orden', orden)
  if (t.pagination.pageIndex > 0) p.set('pagina', String(t.pagination.pageIndex + 1))
  if (t.pagination.pageSize !== 25) p.set('tam', String(t.pagination.pageSize))
  if (v.rol !== 'admin') p.set('rol', v.rol)
  if (v.escenario !== 'normal') p.set('demo', v.escenario)
  const s = p.toString()
  return s ? `?${s}` : location.pathname
}
