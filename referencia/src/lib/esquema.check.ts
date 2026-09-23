// Autoprueba: node src/lib/esquema.check.ts
// 1) El esquema de captura coincide con la tabla real (db/facturas.sql).
// 2) El validador acepta lo que manda Excel y rechaza lo que la tabla rechazaría.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CATEGORIA_LABELS, RESPONSABLES } from './facturas.ts'
import { ESQUEMA, MAX_NUMERIC_12_2, validar } from './esquema.ts'

// ── 1. Paridad con la tabla
const sql = readFileSync(new URL('../../db/facturas.sql', import.meta.url), 'utf8')
const tabla = sql.slice(sql.indexOf('CREATE TABLE facturas'))
const lineaDe = (col: string) => {
  const l = tabla.split('\n').find((x) => new RegExp(`^\\s+${col}\\s`).test(x))
  assert.ok(l, `la columna ${col} no existe en db/facturas.sql`)
  return l
}
for (const c of ESQUEMA) {
  const l = lineaDe(c.columna)
  assert.equal(/NOT NULL/.test(l), c.requerido, `${c.columna}: NOT NULL en la tabla ≠ requerido en el esquema`)
  if (c.tipo === 'texto') {
    const m = l.match(/char_length\(\w+\)\s*(?:BETWEEN\s*\d+\s*AND\s*(\d+)|<=\s*(\d+))/)
    assert.ok(m, `${c.columna}: la tabla no limita el largo`)
    assert.equal(Number(m[1] ?? m[2]), c.max, `${c.columna}: largo máximo distinto`)
  }
  if (c.tipo === 'numero') {
    assert.match(l, /numeric\(12,2\)/, `${c.columna}: tipo distinto de numeric(12,2)`)
    assert.equal(c.max, MAX_NUMERIC_12_2)
    if (/>\s*0\)/.test(l)) assert.ok(c.minExclusivo && c.min === 0, `${c.columna}: CHECK > 0 sin minExclusivo`)
    if (/>=\s*0/.test(l)) assert.ok(!c.minExclusivo && c.min === 0, `${c.columna}: CHECK >= 0 distinto`)
  }
  if (c.tipo === 'fecha') assert.match(l, /\bdate\b/, `${c.columna}: no es date`)
  if (c.columna === 'categoria') {
    const lista = [...l.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    assert.deepEqual(lista.sort(), Object.keys(CATEGORIA_LABELS).sort(), 'categoria: el CHECK IN y las etiquetas no coinciden')
  }
  if (c.columna.endsWith('_id')) assert.match(l, /REFERENCES usuarios/, `${c.columna}: la FK no apunta a usuarios`)
}
// Columnas que la persona NO captura: deben tener default o asignarlas el sistema.
for (const col of ['folio', 'estado', 'id']) assert.ok(!ESQUEMA.some((c) => c.columna === col), `${col} no se captura`)
// Reglas entre columnas presentes en la tabla y en el validador
assert.match(lineaDe('anticipo'), /anticipo <= monto/)
assert.match(lineaDe('vence'), /vence >= emision/)

// ── 2. Validador
const base = { cliente: 'Café Ñandú', categoria: 'Cámara y foto', monto: '12500', emision: '15/09/2026', responsable: 'Sofía Garza' }
const ok = (e: object) => {
  const r = validar(e)
  assert.ok(r.ok, `debía pasar: ${JSON.stringify(e)} → ${JSON.stringify(!r.ok && r.errores)}`)
  return r.valor
}
const falla = (e: object, clave: string, re: RegExp) => {
  const r = validar(e)
  assert.ok(!r.ok, `debía fallar: ${JSON.stringify(e)}`)
  const err = r.errores.find((x) => x.clave === clave)
  assert.ok(err && re.test(err.mensaje), `${clave}: esperaba ${re}, llegó ${JSON.stringify(r.errores)}`)
}

let v = ok(base)
assert.equal(v.categoria, 'camara') // etiqueta → código de la tabla
assert.equal(v.monto, '12500.00')
assert.equal(v.emision, '2026-09-15')
assert.equal(v.anticipo, null)

// Lo que llega de Excel
v = ok({ ...base, categoria: 'camara y foto', monto: '$12,500.50', emision: new Date(Date.UTC(2026, 8, 15)) })
assert.equal(v.categoria, 'camara')
assert.equal(v.monto, '12500.50')
assert.equal(v.emision, '2026-09-15') // Date a medianoche UTC → mismo día (no el 14 en México)
v = ok({ ...base, emision: 46280 }) // serial de Excel
assert.equal(v.emision, '2026-09-15')
v = ok({ ...base, monto: 12500.5, responsable: 'SOFIA GARZA' })
assert.equal(v.responsable, 'Sofía Garza') // se guarda el valor canónico del catálogo

// Lo que la tabla rechazaría
falla({ ...base, cliente: '' }, 'cliente', /obligatorio/)
falla({ ...base, cliente: 'x'.repeat(121) }, 'cliente', /máximo 120.*121/)
falla({ ...base, notas: 'x'.repeat(501) }, 'notas', /máximo 500/)
falla({ ...base, categoria: 'Fotografía' }, 'categoria', /no está en la lista/)
falla({ ...base, responsable: 'Pedro Páramo' }, 'responsable', /no está en la lista/)
falla({ ...base, monto: '0' }, 'monto', /mayor que 0/)
falla({ ...base, monto: '-5' }, 'monto', /mayor que 0/)
falla({ ...base, monto: '12.345' }, 'monto', /2 decimales/)
falla({ ...base, monto: 'doce mil' }, 'monto', /no es un número/)
falla({ ...base, monto: '99999999999' }, 'monto', /máximo/)
falla({ ...base, anticipo: '13000' }, 'anticipo', /mayor que el monto/)
falla({ ...base, anticipo: '-1' }, 'anticipo', /menor que 0/)
falla({ ...base, emision: '31/02/2026' }, 'emision', /no es una fecha que exista/)
falla({ ...base, emision: 'mañana' }, 'emision', /no es una fecha/)
falla({ ...base, vence: '01/09/2026' }, 'vence', /antes de la emisión/)
assert.ok(RESPONSABLES.length > 0)

console.log('esquema.check: ok (paridad con db/facturas.sql + validador)')
