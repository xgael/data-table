'use client'

import { useEffect, useRef, type RefObject } from 'react'

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Lo común a drawer y modal: foco adentro al abrir, trampa de Tab, Esc, scroll
 * de la página bloqueado y foco devuelto al cerrar (a `volverA()` o al que
 * tenía el foco antes).
 */
export function useCapaModal(
  abierto: boolean,
  panel: RefObject<HTMLElement | null>,
  onEscape: () => void,
  volverA?: () => HTMLElement | null,
) {
  const escRef = useRef(onEscape)
  const volverRef = useRef(volverA)
  useEffect(() => {
    escRef.current = onEscape
    volverRef.current = volverA
  })

  useEffect(() => {
    if (!abierto) return
    const previo = document.activeElement as HTMLElement | null
    const primero = panel.current?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(ENFOCABLES)
    primero?.focus()
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return // lo atendió algo de adentro (un menú)
        e.preventDefault()
        escRef.current()
      } else if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((x) => x.offsetParent !== null)
        if (!els.length) return
        const [a, z] = [els[0], els[els.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      html.style.overflow = overflow
      const destino = volverRef.current?.() ?? (previo && previo !== document.body ? previo : null)
      destino?.focus()
    }
  }, [abierto, panel])
}
