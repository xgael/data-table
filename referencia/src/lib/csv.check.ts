// Autoprueba: node src/lib/csv.check.ts
import assert from 'node:assert/strict'
import { celdaCsv } from './csv.ts'

// Invariante de sentido: ninguna celda exportada puede EMPEZAR con un disparador de fórmula.
const hostiles = ['=HYPERLINK("http://x","clic")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']
for (const h of hostiles) {
  const c = celdaCsv(h).replace(/^"/, '')
  assert.ok(!/^[=+\-@\t\r]/.test(c), `sin neutralizar: ${JSON.stringify(h)} → ${c}`)
}
assert.equal(celdaCsv('Café Ñandú'), 'Café Ñandú') // acentos intactos
assert.equal(celdaCsv('a,b'), '"a,b"')
assert.equal(celdaCsv('dice "hola"'), '"dice ""hola"""')
assert.equal(celdaCsv(null), '')
assert.equal(celdaCsv(180000), '180000') // número sin tocar
assert.equal(celdaCsv('-500.25'), '-500.25') // negativo sigue siendo número
assert.equal(celdaCsv('-2+3'), "'-2+3") // pero una expresión no
console.log('csv.check: ok')
