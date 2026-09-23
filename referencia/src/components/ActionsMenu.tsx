'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import styles from './ActionsMenu.module.css'

export type ItemMenu = {
  label: string
  onSelect: () => void
  destructiva?: boolean
  /** Sin permiso → no se lista (no se deshabilita). */
  oculta?: boolean
}

const ALTO_ITEM = 36
const ALTO_SEPARADOR = 9
const PADDING = 8
const ANCHO = 216

// La posición se calcula ANTES de abrir: nunca se pinta un frame sin posicionar.
// Abre hacia arriba si abajo no cabe.
function calcular(boton: HTMLElement, alto: number) {
  const r = boton.getBoundingClientRect()
  const cabeAbajo = r.bottom + 4 + alto <= window.innerHeight - 8
  return {
    top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - 4 - alto),
    left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)),
  }
}

export function ActionsMenu({ registro, items }: { registro: string; items: ItemMenu[] }) {
  const visibles = items.filter((i) => !i.oculta)
  const normales = visibles.filter((i) => !i.destructiva)
  const destructivas = visibles.filter((i) => i.destructiva)
  const orden = [...normales, ...destructivas] // la destructiva siempre al final

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const abierto = pos !== null
  const alto = orden.length * ALTO_ITEM + (normales.length && destructivas.length ? ALTO_SEPARADOR : 0) + PADDING

  function abrir(foco: 'primero' | 'ultimo' = 'primero') {
    setPos(calcular(boton.current!, alto))
    requestAnimationFrame(() => refs.current[foco === 'primero' ? 0 : orden.length - 1]?.focus())
  }

  function cerrar(devolverFoco: boolean) {
    setPos(null)
    if (devolverFoco) boton.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) cerrar(false)
    }
    // Al desplazar, el menú SIGUE a su botón; sólo se cierra si el botón sale del
    // área visible de su contenedor. Cerrar con cualquier scroll lo cerraba al
    // abrirlo desde una fila a medio ver: el clic enfoca el botón, el navegador
    // desplaza para mostrarlo, y ese scroll lo cerraba en el mismo instante.
    const alMover = () => {
      const b = boton.current
      if (!b) return cerrar(false)
      const r = b.getBoundingClientRect()
      let visible = r.bottom > 0 && r.top < window.innerHeight
      for (let el = b.parentElement; el && visible; el = el.parentElement) {
        if (!/(auto|scroll|hidden)/.test(getComputedStyle(el).overflowY + getComputedStyle(el).overflowX)) continue
        const c = el.getBoundingClientRect()
        visible = r.bottom > c.top && r.top < c.bottom && r.right > c.left && r.left < c.right
      }
      if (visible) setPos(calcular(b, alto))
      else cerrar(false)
    }
    // Esc cierra esté donde esté el foco: justo después del clic, el foco sigue en
    // el disparador (el paso al primer ítem espera un frame).
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cerrar(true)
    }
    document.addEventListener('keydown', esc, true)
    document.addEventListener('pointerdown', fuera)
    window.addEventListener('resize', alMover)
    window.addEventListener('scroll', alMover, true)
    return () => {
      document.removeEventListener('keydown', esc, true)
      document.removeEventListener('pointerdown', fuera)
      window.removeEventListener('resize', alMover)
      window.removeEventListener('scroll', alMover, true)
    }
  }, [abierto, alto])

  function teclaMenu(e: KeyboardEvent) {
    const i = refs.current.findIndex((b) => b === document.activeElement)
    const mover = (n: number) => refs.current[(n + orden.length) % orden.length]?.focus()
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(i + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); mover(0) }
    else if (e.key === 'End') { e.preventDefault(); mover(orden.length - 1) }
    else if (e.key === 'Tab') cerrar(false)
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={styles.disparador}
        aria-label={`Acciones de ${registro}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        onClick={(e) => {
          e.stopPropagation() // la fila es clicable: abrir el menú no abre el detalle
          if (abierto) cerrar(false)
          else abrir()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); abrir('primero') }
          if (e.key === 'ArrowUp') { e.preventDefault(); abrir('ultimo') }
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {abierto &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={`Acciones de ${registro}`}
            className={styles.menu}
            style={{ top: pos.top, left: pos.left, width: ANCHO }}
            onKeyDown={teclaMenu}
            onClick={(e) => e.stopPropagation()}
          >
            {orden.map((item, i) => (
              <div key={item.label}>
                {i === normales.length && normales.length > 0 && <div role="separator" className={styles.separador} />}
                <button
                  ref={(el) => { refs.current[i] = el }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={item.destructiva ? styles.itemPeligro : styles.item}
                  onClick={() => {
                    cerrar(true)
                    item.onSelect()
                  }}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
