/**
 * Helper d'export CSV compatible Excel (UTF-8 BOM + séparateur ;).
 * Usage : exportCSV('familles.csv', ['Nom', 'Email'], rows.map(r => [r.nom, r.email]))
 */

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Si contient ; " \n ou \r, on quote et on échappe les "
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function buildCSV(headers: string[], rows: any[][]): string {
  const lines = [headers.map(escapeCsv).join(';')]
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(';'))
  }
  return lines.join('\r\n')
}

export function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const csv = buildCSV(headers, rows)
  // UTF-8 BOM pour Excel
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : filename + '.csv')
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function formatDateCSV(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('fr-FR')
  } catch { return d || '' }
}

export function formatMontantCSV(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return ''
  // Excel français : virgule décimale
  return num.toFixed(2).replace('.', ',')
}
