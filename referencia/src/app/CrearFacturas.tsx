'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { sileo } from 'sileo'
import { Modal } from '@/components/Modal'
import { ESQUEMA, MAX_FILAS, validar, type Campo, type Clave } from '@/lib/esquema'
import type { NuevaFactura } from '@/lib/facturas'
import type { Lectura, Revision } from '@/lib/plantilla'
import styles from './CrearFacturas.module.css'

export type Pestana = 'una' | 'masiva'

const VACIO = Object.fromEntries(ESQUEMA.map((c) => [c.clave, ''])) as Record<Clave, string>
const MAX_ERRORES_VISIBLES = 200

export function CrearFacturas({
  pestana,
  onPestana,
  onCerrar,
  onCrear,
  volverA,
}: {
  pestana: Pestana | null
  onPestana: (p: Pestana) => void
  onCerrar: () => void
  /** Devuelve los folios creados. */
  onCrear: (nuevas: NuevaFactura[]) => string[]
  volverA: () => HTMLElement | null
}) {
  const [valores, setValores] = useState<Record<Clave, string>>(VACIO)
  const [errores, setErrores] = useState<Partial<Record<Clave, string>>>({})
  const [intentado, setIntentado] = useState(false)
  const [creadas, setCreadas] = useState<string[]>([])
  const [carga, setCarga] = useState<{ archivo: string; estado: 'leyendo' } | { archivo: string; lectura: Lectura } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const idForm = useId()
  const refs = useRef<Partial<Record<Clave, HTMLElement | null>>>({})

  const sucio = Object.values(valores).some((v) => v.trim() !== '') || carga !== null
  const reiniciar = () => {
    setValores(VACIO); setErrores({}); setIntentado(false); setCreadas([]); setCarga(null); setConfirmando(false)
  }
  const cerrar = () => { reiniciar(); onCerrar() }
  const seguirEditando = () => {
    setConfirmando(false)
    requestAnimationFrame(() => document.getElementById(`tab-${pestana}`)?.focus())
  }
  // Esc/✕/Cancelar: con datos pide confirmar; sobre la confirmación, Esc = seguir editando.
  const pedirCierre = () => (confirmando ? seguirEditando() : sucio ? setConfirmando(true) : cerrar())

  // ── Una factura
  function erroresDe(v: Record<Clave, string>) {
    const r = validar(v)
    const map: Partial<Record<Clave, string>> = {}
    if (r.ok) return { r, map }
    for (const e of r.errores) map[e.clave] ??= e.mensaje
    return { r, map }
  }
  function cambiar(clave: Clave, v: string) {
    const nv = { ...valores, [clave]: v }
    setValores(nv)
    if (intentado) setErrores(erroresDe(nv).map) // tras el primer intento, se corrige en vivo
  }
  function enviar(otra: boolean) {
    const { r, map } = erroresDe(valores)
    if (!r.ok) {
      setErrores(map); setIntentado(true)
      const primera = ESQUEMA.find((c) => map[c.clave])
      if (primera) refs.current[primera.clave]?.focus()
      return
    }
    const [folio] = onCrear([r.valor])
    if (otra) {
      setValores(VACIO); setErrores({}); setIntentado(false)
      setCreadas((xs) => [...xs, folio])
      refs.current[ESQUEMA[0].clave]?.focus()
    } else cerrar()
  }

  // ── Carga masiva
  async function leer(archivo: File) {
    setCarga({ archivo: archivo.name, estado: 'leyendo' })
    const { leerCarga } = await import('@/lib/plantilla')
    setCarga({ archivo: archivo.name, lectura: await leerCarga(archivo) })
  }
  const rev: Revision | null = carga && 'lectura' in carga && !('fatal' in carga.lectura) ? carga.lectura : null

  // ── Pestañas (patrón ARIA tabs: flechas mueven y activan)
  const tabs: { id: Pestana; label: string }[] = [
    { id: 'una', label: 'Una factura' },
    { id: 'masiva', label: 'Carga masiva (Excel)' },
  ]
  function teclaTabs(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const sig = pestana === 'una' ? 'masiva' : 'una'
    onPestana(sig)
    requestAnimationFrame(() => document.getElementById(`tab-${sig}`)?.focus())
  }

  const pie = confirmando ? null : pestana === 'una' ? (
    <>
      {creadas.length > 0 && <span className={styles.creadas} role="status">Creadas: {creadas.join(', ')}</span>}
      <button type="button" className={styles.secundario} onClick={pedirCierre}>Cancelar</button>
      <button type="button" className={styles.secundario} onClick={() => enviar(true)}>Crear y agregar otra</button>
      <button type="submit" form={idForm} className={styles.primario}>Crear factura</button>
    </>
  ) : (
    <>
      {rev && rev.validas.length === 0 && <span className={styles.motivo}>No hay filas válidas para importar.</span>}
      <button type="button" className={styles.secundario} onClick={pedirCierre}>Cancelar</button>
      <button
        type="button"
        className={styles.primario}
        disabled={!rev || rev.validas.length === 0}
        onClick={() => { if (rev) { onCrear(rev.validas.map((v) => v.valor)); cerrar() } }}
      >
        {!rev ? 'Importar'
          : rev.errores.length ? `Importar ${rev.validas.length} válidas y omitir ${rev.filasConError.length}`
          : `Importar ${rev.validas.length} ${rev.validas.length === 1 ? 'factura' : 'facturas'}`}
      </button>
    </>
  )

  return (
    <Modal abierto={pestana !== null} onCerrar={pedirCierre} titulo="Nueva factura" pie={pie} volverA={volverA}>
      {confirmando ? (
        <div className={styles.confirmar} role="alertdialog" aria-labelledby="conf-t" aria-describedby="conf-d">
          <p id="conf-t" className={styles.confirmarTitulo}>¿Descartar lo capturado?</p>
          <p id="conf-d" className={styles.ayuda}>
            {carga ? `Se perderá la revisión de «${carga.archivo}».` : 'Los datos del formulario no se han guardado.'}
          </p>
          <div className={styles.acciones}>
            <button type="button" className={styles.secundario} data-autofocus autoFocus onClick={seguirEditando}>Seguir editando</button>
            <button type="button" className={styles.peligro} onClick={cerrar}>Descartar</button>
          </div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Forma de crear" className={styles.tabs} onKeyDown={teclaTabs}>
            {tabs.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={pestana === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={pestana === t.id ? 0 : -1}
                className={styles.tab}
                onClick={() => onPestana(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div id="panel-una" role="tabpanel" aria-labelledby="tab-una" hidden={pestana !== 'una'} className={styles.panel}>
            <p className={styles.ayuda}>Los campos con <span aria-hidden="true">*</span> son obligatorios. Folio y estado los asigna el sistema.</p>
            <form id={idForm} noValidate className={styles.form} onSubmit={(e) => { e.preventDefault(); enviar(false) }}>
              {ESQUEMA.map((c, i) => (
                <CampoForm
                  key={c.clave}
                  autoFoco={i === 0 && pestana === 'una'}
                  c={c}
                  valor={valores[c.clave]}
                  error={errores[c.clave]}
                  onCambio={(v) => cambiar(c.clave, v)}
                  refEl={(el) => { refs.current[c.clave] = el }}
                />
              ))}
            </form>
          </div>

          <div id="panel-masiva" role="tabpanel" aria-labelledby="tab-masiva" hidden={pestana !== 'masiva'} className={styles.panel}>
            <CargaMasiva carga={carga} rev={rev} onArchivo={leer} onOtro={() => setCarga(null)} autoFoco={pestana === 'masiva'} />
          </div>
        </>
      )}
    </Modal>
  )
}

function CampoForm({
  c, valor, error, onCambio, refEl, autoFoco,
}: {
  autoFoco?: boolean
  c: Campo
  valor: string
  error?: string
  onCambio: (v: string) => void
  refEl: (el: HTMLElement | null) => void
}) {
  const id = `c-${c.clave}`
  const describe = [`a-${c.clave}`, c.tipo === 'texto' ? `n-${c.clave}` : '', error ? `e-${c.clave}` : ''].filter(Boolean).join(' ')
  const comun = {
    id,
    ref: refEl,
    'aria-invalid': !!error || undefined,
    'aria-describedby': describe,
    'aria-required': c.requerido || undefined,
    'data-autofocus': autoFoco || undefined, // el foco inicial del modal cae aquí, no en la ✕
    className: styles.control,
  }
  return (
    <div className={c.largo ? styles.campoAncho : styles.campo}>
      <label htmlFor={id} className={styles.etiqueta}>
        {c.etiqueta}
        {c.requerido && <span className={styles.req} aria-hidden="true"> *</span>}
      </label>
      {c.tipo === 'opcion' ? (
        <select {...comun} value={valor} onChange={(e) => onCambio(e.target.value)}>
          <option value="">Elige…</option>
          {c.opciones!().map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : c.tipo === 'fecha' ? (
        <input {...comun} type="date" min="2000-01-01" max="2100-12-31" value={valor} onChange={(e) => onCambio(e.target.value)} />
      ) : c.tipo === 'numero' ? (
        <div className={styles.dinero}>
          <span aria-hidden="true">$</span>
          <input {...comun} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={valor} onChange={(e) => onCambio(e.target.value)} />
        </div>
      ) : c.largo ? (
        <textarea {...comun} rows={3} value={valor} onChange={(e) => onCambio(e.target.value)} />
      ) : (
        <input {...comun} type="text" autoComplete="off" value={valor} onChange={(e) => onCambio(e.target.value)} />
      )}
      <span id={`a-${c.clave}`} className={styles.ayuda}>{c.ayuda}</span>
      {/* Sin maxLength: el navegador recortaría en silencio lo pegado. Se cuenta y se rechaza. */}
      {c.tipo === 'texto' && c.max && (
        <span id={`n-${c.clave}`} className={valor.length > c.max ? styles.contadorExcedido : styles.contador}>
          {valor.length}/{c.max}
        </span>
      )}
      {error && <span id={`e-${c.clave}`} className={styles.error}>{c.etiqueta} {error}.</span>}
    </div>
  )
}

function CargaMasiva({
  carga, rev, onArchivo, onOtro, autoFoco,
}: {
  autoFoco: boolean
  carga: { archivo: string; estado: 'leyendo' } | { archivo: string; lectura: Lectura } | null
  rev: Revision | null
  onArchivo: (f: File) => void
  onOtro: () => void
}) {
  const [generando, setGenerando] = useState<'plantilla' | 'errores' | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function plantilla(conErrores: boolean) {
    setGenerando(conErrores ? 'errores' : 'plantilla')
    // Un solo aviso que pasa de «generando» a «listo» o al error (sileo.promise).
    await sileo
      .promise(
        import('@/lib/plantilla').then(({ descargarPlantilla }) => descargarPlantilla(conErrores ? rev?.filasConError : undefined)),
        {
          loading: { title: conErrores ? 'Preparando filas con errores…' : 'Generando plantilla…' },
          success: { title: conErrores ? 'Archivo de errores descargado' : 'Plantilla descargada' },
          error: (e) => ({ title: 'No se pudo generar el archivo', description: e instanceof Error ? e.message : String(e) }),
        },
      )
      .catch(() => {}) // el aviso ya dijo el error
      .finally(() => setGenerando(null))
  }
  const fatal = carga && 'lectura' in carga && 'fatal' in carga.lectura ? carga.lectura.fatal : null

  return (
    <div className={styles.pasos}>
      <section className={styles.paso}>
        <h3 className={styles.pasoTitulo}><span className={styles.num}>1</span> Descarga la plantilla</h3>
        <p className={styles.ayuda}>
          Trae las columnas de la tabla de facturas y las listas vigentes de categorías y responsables. Excel no te deja
          escribir valores fuera de ellas, ni montos negativos o un vencimiento antes de la emisión.
        </p>
        <button type="button" className={styles.secundario} data-autofocus={autoFoco || undefined} onClick={() => plantilla(false)} disabled={generando !== null}>
          {generando === 'plantilla' ? 'Generando…' : 'Descargar plantilla (.xlsx)'}
        </button>
      </section>

      <section className={styles.paso}>
        <h3 className={styles.pasoTitulo}><span className={styles.num}>2</span> Sube el archivo lleno</h3>
        {!carga ? (
          <label
            className={styles.zona}
            data-arrastrando={arrastrando || undefined}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault(); setArrastrando(false)
              const f = e.dataTransfer.files[0]
              if (f) onArchivo(f)
            }}
          >
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = '' // permite volver a elegir el mismo archivo
                if (f) onArchivo(f)
              }}
            />
            <span className={styles.zonaTitulo}>Arrastra aquí tu archivo o <u>elige uno</u></span>
            <span className={styles.ayuda}>Sólo .xlsx, hasta 5 MB y {MAX_FILAS} filas.</span>
          </label>
        ) : (
          <div className={styles.archivo}>
            <span>{carga.archivo}</span>
            <button type="button" className={styles.enlace} onClick={onOtro}>Elegir otro archivo</button>
          </div>
        )}
      </section>

      {carga && (
        <section className={styles.paso} aria-live="polite">
          <h3 className={styles.pasoTitulo}><span className={styles.num}>3</span> Revisa antes de importar</h3>
          {'estado' in carga ? (
            <p role="status">Leyendo el archivo…</p>
          ) : fatal ? (
            <p role="alert" className={styles.fatal}>{fatal}</p>
          ) : rev && (
            <>
              <p className={styles.resumen}>
                {rev.leidas} {rev.leidas === 1 ? 'fila leída' : 'filas leídas'}:{' '}
                <strong className={styles.okTxt}>{rev.validas.length} listas para importar</strong>
                {rev.filasConError.length > 0 && <>, <strong className={styles.errTxt}>{rev.filasConError.length} con errores</strong></>}.
              </p>
              {rev.avisos.length > 0 && (
                <ul className={styles.avisos}>{rev.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              )}
              {rev.errores.length > 0 && (
                <>
                  <div className={styles.tablaErrores} role="region" aria-label="Errores por fila" tabIndex={0}>
                    <table>
                      <caption className="sr-only">Errores encontrados en el archivo</caption>
                      <thead>
                        <tr><th scope="col">Fila</th><th scope="col">Columna</th><th scope="col">Valor</th><th scope="col">Problema</th></tr>
                      </thead>
                      <tbody>
                        {rev.errores.slice(0, MAX_ERRORES_VISIBLES).map((e, i) => (
                          <tr key={i}><td className={styles.numCol}>{e.fila}</td><td>{e.etiqueta}</td><td>{e.valor}</td><td>{e.mensaje}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rev.errores.length > MAX_ERRORES_VISIBLES && (
                    <p className={styles.ayuda}>Se muestran {MAX_ERRORES_VISIBLES} de {rev.errores.length} errores; el archivo de abajo los trae todos.</p>
                  )}
                  <div className={styles.acciones}>
                    <button type="button" className={styles.secundario} onClick={() => plantilla(true)} disabled={generando !== null}>
                      {generando === 'errores' ? 'Generando…' : `Descargar las ${rev.filasConError.length} filas con errores (.xlsx)`}
                    </button>
                    <span className={styles.ayuda}>Corrígelas ahí mismo (la columna «Errores» dice qué) y súbelo de nuevo.</span>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
