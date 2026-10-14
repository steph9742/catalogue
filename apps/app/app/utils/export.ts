export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Données exportables : un tableau de lignes, un objet paginé { rows }, ou un objet seul.
type Exportable = { rows?: unknown[] } | unknown[] | Record<string, unknown> | null | undefined

// Normalise les trois formes en un tableau de lignes.
const lignesDe = (data: Exportable): Record<string, unknown>[] => {
  if (data && !Array.isArray(data) && Array.isArray(data.rows)) return data.rows as Record<string, unknown>[]
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  return [data as Record<string, unknown>]
}

export const exportAsJson = (data: Exportable, filename: string = `export_${Date.now()}.json`) => {
  const content = JSON.stringify(data, null, 2)
  downloadFile(content, filename, 'application/json')
}

export const exportAsCsv = (data: Exportable, filename: string = `export_${Date.now()}.csv`) => {
  const rows = lignesDe(data)

  if (rows.length === 0 || !rows[0]) {
    return
  }

  const headers = Object.keys(rows[0])
  const csvContent = rows.map((row: Record<string, unknown>) => {
    return headers.map((header) => {
      let cell = row[header] === null || row[header] === undefined ? '' : String(row[header])
      cell = cell.replace(/"/g, '""')
      if (cell.search(/("|,|\n)/g) >= 0) {
        cell = `"${cell}"`
      }
      return cell
    }).join(',')
  })

  const content = [headers.join(','), ...csvContent].join('\n')
  downloadFile(content, filename, 'text/csv')
}

export const exportAsText = (data: Exportable, filename: string = `export_${Date.now()}.txt`) => {
  let content = ''
  const rows = lignesDe(data)

  rows.forEach((row: Record<string, unknown>, index: number) => {
    content += `--- Result ${index + 1} ---\n`
    Object.entries(row).forEach(([key, value]) => {
      content += `${key}: ${value}\n`
    })
    content += '\n'
  })

  downloadFile(content, filename, 'text/plain')
}
