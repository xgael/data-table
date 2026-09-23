-- Tabla de la base que respalda la pantalla de Facturas.
-- src/lib/esquema.ts la refleja campo por campo; `npm run check` falla si
-- alguna restricción de aquí (CHECK, NOT NULL, longitudes, catálogos) cambia
-- y el esquema no.

CREATE TABLE usuarios (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE
);

CREATE TABLE facturas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio          text NOT NULL UNIQUE,                 -- lo asigna el sistema
  cliente        text NOT NULL CHECK (char_length(cliente) BETWEEN 1 AND 120),
  categoria      text NOT NULL CHECK (categoria IN ('camara', 'publicacion', 'diseno', 'evento', 'consultoria')),
  estado         text NOT NULL DEFAULT 'pendiente'     -- lo deriva el sistema
                 CHECK (estado IN ('vencida', 'pendiente', 'pagada', 'cancelada')),
  monto          numeric(12,2) NOT NULL CHECK (monto > 0),
  anticipo       numeric(12,2) CHECK (anticipo >= 0 AND anticipo <= monto),
  emision        date NOT NULL,
  vence          date CHECK (vence >= emision),
  responsable_id uuid NOT NULL REFERENCES usuarios (id),
  notas          text CHECK (char_length(notas) <= 500),
  eliminado_en   timestamptz                           -- borrado lógico
);
