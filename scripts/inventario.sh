#!/usr/bin/env bash
# Inventario de tablas y sospechas estáticas de un repo front.
# Uso: inventario.sh [dir]   (por defecto: .)
# Sólo LEE. Cada línea es una pista a confirmar en pantalla, no un hallazgo.
set -euo pipefail
DIR="${1:-.}"
INC=(--include='*.tsx' --include='*.jsx' --include='*.ts' --include='*.js' --include='*.vue' --include='*.svelte' --include='*.html')
EXC=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=coverage --exclude-dir=.git --exclude-dir=vendor)

buscar() { # título, regex
  local out
  out=$(grep -rnE "${INC[@]}" "${EXC[@]}" -- "$2" "$DIR" 2>/dev/null | grep -vE '\.(test|spec)\.|\.d\.ts:' || true)
  printf '\n## %s (%s)\n' "$1" "$(printf '%s' "$out" | grep -c . || true)"
  [ -n "$out" ] && printf '%s\n' "$out" | cut -c1-200 | head -40
  return 0
}

echo "# Inventario de tablas — $DIR"
buscar 'Tablas: <table> o primitiva' '<table|useReactTable|<DataTable|<DataGrid|<Table[ >]|AgGridReact|MUIDataTable'
buscar 'Columnas definidas' 'ColumnDef<|createColumnHelper|columns *[:=] *\['
buscar 'Listas con datos unidos por · o — (¿debía ser tabla?)' '\} *(·|—) *\{'
buscar 'Recorte silencioso (.slice en render)' '\.slice\(0, *[0-9]+\)\.map'
buscar 'accessorKey sobre número/fecha (confirmar tipo en runtime: ISO ordena bien, "180000" no)' "accessorKey: *['\"][a-z_]*(monto|total|precio|importe|costo|cantidad|stock|saldo|fecha|_at|_en)['\"]"
buscar 'Búsqueda sin normalizar acentos' '\.toLowerCase\(\)\.includes\('
buscar 'Expansión inline (¿debía ser drawer?)' 'getIsExpanded|expandedRow|setExpanded|getCanExpand'
buscar 'Paginación de servidor (no filtrar en cliente)' 'page_size|pageSize=|[?&]page=|manualPagination'
buscar 'Botones de acción en celdas (¿fuera del menú ⋯?)' 'cell: *\(.*<(button|Button)'
