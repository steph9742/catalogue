// xlsx est lourd et son require interne de cpexcel.js casse le bundle SSR.
// On le charge dynamiquement, uniquement côté client au moment de l'export/import.
const loadXLSX = () => import('xlsx')

export type ExportFormat = 'csv' | 'ods'

export type ExportColumn<T> = {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

export const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Export générique d'un tableau vers CSV (séparateur ; + BOM, pour Excel/LibreOffice FR)
// ou ODS (format natif LibreOffice Calc), via SheetJS.
export async function exportTable<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  format: ExportFormat,
) {
  const XLSX = await loadXLSX()
  const aoa: (string | number | boolean)[][] = [
    columns.map(c => c.header),
    ...rows.map(r => columns.map((c) => {
      const v = c.value(r)
      return v == null ? '' : v
    })),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' })
    triggerDownload(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
      `${filename}.csv`,
    )
    return
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  const data = XLSX.write(wb, { bookType: 'ods', type: 'array' })
  triggerDownload(
    new Blob([new Uint8Array(data)], { type: 'application/vnd.oasis.opendocument.spreadsheet' }),
    `${filename}.ods`,
  )
}

// Lecture d'un fichier CSV/ODS/XLSX déposé → tableau d'objets (clés = en-têtes).
export async function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const first = wb.SheetNames[0]
  const ws = first ? wb.Sheets[first] : undefined
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, string>[]
}

// Modèle d'import : un CSV vide avec les en-têtes attendus (clés techniques).
export function downloadTemplate(headers: string[], filename: string) {
  const content = '﻿' + headers.join(';') + '\n'
  triggerDownload(new Blob([content], { type: 'text/csv;charset=utf-8' }), `${filename}-modele.csv`)
}
