'use client'

import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'
import { useCapaModal } from './useCapaModal'

/**
 * Diálogo centrado para tareas con captura. El clic en el fondo NO cierra:
 * un clic de más no debe tirar un formulario lleno. Cerrar pasa por
 * `onCerrar`, que decide si hay cambios que confirmar.
 */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  children,
  pie,
  volverA,
  ancho = 720,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  children: ReactNode
  pie?: ReactNode
  volverA?: () => HTMLElement | null
  ancho?: number
}) {
  const panel = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  useCapaModal(abierto, panel, onCerrar, volverA)

  if (!abierto) return null
  return createPortal(
    <div className={styles.capa}>
      <div className={styles.fondo} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={styles.panel}
        style={{ width: `min(${ancho}px, calc(100vw - 32px))` }}
      >
        <header className={styles.cabecera}>
          <h2 id={idTitulo} className={styles.titulo}>{titulo}</h2>
          <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
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
