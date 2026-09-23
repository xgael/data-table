// Dominio de la demo: facturas de cobranza. Los datos llegan como llegarían de
// Postgres por un driver real: `numeric` como TEXTO y `date` como 'YYYY-MM-DD'.
// Así la tabla tiene que resolver las dos trampas clásicas (§4.1 y fechas).

export type EstadoCodigo = 'vencida' | 'pendiente' | 'pagada' | 'cancelada'
export type CategoriaCodigo = 'camara' | 'publicacion' | 'diseno' | 'evento' | 'consultoria'
export type Rol = 'admin' | 'cobranza' | 'consulta'

export type Factura = {
  id: string
  folio: string
  cliente: string
  categoria: CategoriaCodigo
  estado: EstadoCodigo
  monto: string // numeric → string
  anticipo: string | null // NULL = sin anticipo, no "cero"
  emision: string // date
  vence: string | null // NULL = de contado, sin vencimiento
  responsable: string
  notas: string
}

export const ESTADO_LABELS: Record<EstadoCodigo, string> = {
  vencida: 'Vencida',
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
}
// Orden de la tarea (cobrar): lo urgente primero. No es alfabético.
export const ESTADO_RANK: Record<EstadoCodigo, number> = { vencida: 0, pendiente: 1, pagada: 2, cancelada: 3 }

export const CATEGORIA_LABELS: Record<CategoriaCodigo, string> = {
  camara: 'Cámara y foto',
  publicacion: 'Publicación impresa',
  diseno: 'Diseño',
  evento: 'Evento',
  consultoria: 'Consultoría',
}

export const ROL_LABELS: Record<Rol, string> = {
  admin: 'Administración',
  cobranza: 'Cobranza',
  consulta: 'Consulta',
}

// ── Permisos: UNA regla, la misma que aplicaría el servidor. La UI la usa para
// listar (no deshabilitar) acciones y para contar el alcance de las masivas.
export type Accion = 'ver' | 'exportar' | 'registrarPago' | 'cancelar' | 'eliminar'

export const puedeCrear = (rol: Rol) => rol === 'admin' || rol === 'cobranza'

export function puede(rol: Rol, accion: Accion, f: Factura): boolean {
  switch (accion) {
    case 'ver':
    case 'exportar':
      return true
    case 'registrarPago':
      return (rol === 'admin' || rol === 'cobranza') && (f.estado === 'pendiente' || f.estado === 'vencida')
    case 'cancelar':
      return rol === 'admin' && f.estado !== 'pagada' && f.estado !== 'cancelada'
    case 'eliminar':
      return rol === 'admin' && f.estado !== 'pagada'
  }
}

// ── Semilla determinista (misma data en cada carga, para que las sondas comparen)
export const HOY = '2026-09-23'

function prng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLIENTES = [
  'Óptica Álvarez', 'Café Ñandú', 'Ágora Medios', 'Grupo Pérez Treviño', 'Hotel Las Ánimas',
  'Constructora Ibáñez', 'Librería El Búho', 'Farmacias Núñez', 'Estudio Río Bravo', 'Panadería La Espiga',
  'Clínica San Ángel', 'Distribuidora Oaxaca', 'Autopartes Ruiz', 'Viñedos Querétaro', 'Colegio Montessori Sur',
]
// Tabla `usuarios` (FK de facturas.responsable_id). En producción la lista viene
// de la base en el momento de descargar la plantilla y de validar la carga.
export const RESPONSABLES = ['Ana Rodríguez', 'Luis Méndez', 'Sofía Garza', 'Iván Téllez', 'Mónica Ortiz']
const CATEGORIAS = Object.keys(CATEGORIA_LABELS) as CategoriaCodigo[]

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function generarFacturas(n = 137): Factura[] {
  const r = prng(20260923)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const out: Factura[] = []
  for (let i = 1; i <= n; i++) {
    const emision = sumarDias(HOY, -Math.floor(r() * 150))
    const contado = r() < 0.12
    const vence = contado ? null : sumarDias(emision, pick([15, 30, 45, 60]))
    const monto = (Math.round((2000 + r() * 78000) * 100) / 100).toFixed(2)
    const anticipo = r() < 0.4 ? (Number(monto) * pick([0.1, 0.25, 0.5])).toFixed(2) : null
    const tiro = r()
    let estado: EstadoCodigo
    if (tiro < 0.08) estado = 'cancelada'
    else if (tiro < 0.45) estado = 'pagada'
    else estado = vence && vence < HOY ? 'vencida' : 'pendiente'
    out.push({
      id: `fac_${String(i).padStart(4, '0')}`,
      folio: `F-2026-${String(i).padStart(4, '0')}`,
      cliente: pick(CLIENTES),
      categoria: pick(CATEGORIAS),
      estado,
      monto,
      anticipo,
      emision,
      vence,
      responsable: pick(RESPONSABLES),
      notas: '',
    })
  }
  // Casos que las sondas necesitan, fijados a mano (verificacion.md §8):
  // un monto con un dígito más que el resto, entre montos de 5 dígitos.
  const fijos: [number, string][] = [[3, '180000.00'], [4, '21150.00'], [5, '23400.00'], [6, '41100.00']]
  for (const [i, m] of fijos) out[i].monto = m
  out[3].notas = 'Contrato anual; el monto incluye 12 meses de pauta.'
  return out
}

export type Escenario = 'normal' | 'vacio' | 'error' | 'lento'
export const ESCENARIOS: Escenario[] = ['normal', 'vacio', 'error', 'lento']

// API simulada. `lento` deja ver el esqueleto; `error` falla para probar Reintentar.
export async function cargarFacturas(escenario: Escenario): Promise<Factura[]> {
  await new Promise((res) => setTimeout(res, escenario === 'lento' ? 2500 : 450))
  if (escenario === 'error') throw new Error('El servidor respondió 503')
  if (escenario === 'vacio') return []
  return generarFacturas()
}

// ── Alta. Lo que captura la persona (formulario o una fila del Excel). Folio,
// estado e id NO están aquí: los asigna el sistema, igual que en la tabla.
export type NuevaFactura = {
  cliente: string
  categoria: CategoriaCodigo
  monto: string
  anticipo: string | null
  emision: string
  vence: string | null
  responsable: string
  notas: string | null
}

export function crearFacturas(nuevas: NuevaFactura[], existentes: Factura[], hoy = HOY): Factura[] {
  let n = existentes.reduce((m, f) => Math.max(m, Number(f.folio.slice(-4)) || 0), 0)
  const semilla = Date.now().toString(36)
  return nuevas.map((x, i) => {
    n += 1
    return {
      id: `fac_${semilla}_${i}`,
      folio: `F-2026-${String(n).padStart(4, '0')}`,
      estado: x.vence && x.vence < hoy ? 'vencida' : 'pendiente',
      ...x,
      notas: x.notas ?? '',
    }
  })
}
