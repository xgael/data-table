'use client'

// Avisos con Sileo. Esta capa fija lo que se repite en toda la app: cuánto vive
// un Deshacer, que no se ejecute dos veces y el atajo de teclado.
import { sileo } from 'sileo'

export const DURACION_DESHACER = 10_000

let ultimo: { id: string; fn: () => void; vence: number } | null = null

export function avisar({ titulo, descripcion, deshacer }: { titulo: string; descripcion?: string; deshacer?: () => void }) {
  if (!deshacer) return sileo.success({ title: titulo, description: descripcion })
  let usado = false
  const fn = () => {
    if (usado) return // botón + atajo, o dos clics: una sola vez
    usado = true
    if (ultimo?.fn === fn) ultimo = null
    deshacer()
  }
  const id = sileo.success({
    title: titulo,
    description: descripcion,
    duration: DURACION_DESHACER,
    // Sileo colapsa a los 4000 ms FIJOS (6000 − 2000), sin mirar `duration`: el
    // botón desaparecía a mitad de la vida del aviso. El colapso va con la duración.
    autopilot: { expand: 150, collapse: DURACION_DESHACER },
    button: { title: 'Deshacer', onClick: fn },
  })
  ultimo = { id, fn, vence: Date.now() + DURACION_DESHACER }
  return id
}

/** Deshace la última acción mientras su aviso siga vivo. Para el atajo ⌘Z / Ctrl+Z. */
export function deshacerUltimo(): boolean {
  if (!ultimo || Date.now() > ultimo.vence) return false
  const u = ultimo
  u.fn()
  sileo.dismiss(u.id)
  return true
}
