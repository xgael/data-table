'use client'

import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Drawer.module.css'
import { useCapaModal } from './useCapaModal'

export function Drawer({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  pie,
  volverA,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo?: ReactNode
  children: ReactNode
  pie?: ReactNode
  /** Elemento al que regresa el foco al cerrar (el disparador). */
  volverA?: () => HTMLElement | null
}) {
  const panel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  useCapaModal(abierto, panel, onCerrar, volverA)

  if (!abierto) return null
  return createPortal(
    <div className={styles.capa}>
      <div className={styles.fondo} onClick={onCerrar} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={idTitulo} className={styles.panel}>
        <header className={styles.cabecera}>
          <div>
            <h2 id={idTitulo} className={styles.titulo}>{titulo}</h2>
            {subtitulo && <div className={styles.subtitulo}>{subtitulo}</div>}
          </div>
          <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar detalle">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div className={styles.cuerpo}>{children}</div>
        {pie && <footer className={styles.pie}>{pie}</footer>}
      </div>
    </div>,
    document.body,
  )
}
