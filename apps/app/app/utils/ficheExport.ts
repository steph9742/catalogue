// Export d'une fiche complète en Markdown, ODT (LibreOffice) et PDF.
// Représentation neutre d'une fiche, construite par chaque page de détail.
export type FicheRow = { label: string, value: string }
export type FicheSection = { title: string, rows?: FicheRow[], lines?: string[] }
export type FichePill = string | { text: string, tone?: string }
export type FicheDoc = {
  title: string
  subtitle?: string
  pills?: FichePill[]
  sections: FicheSection[]
}

const pillText = (p: FichePill) => (typeof p === 'string' ? p : p.text)
const pillTone = (p: FichePill) => (typeof p === 'string' ? 'primary' : (p.tone ?? 'primary'))

const slug = (s: string) => (s || 'fiche').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fiche'

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ---------- Markdown ----------
export function buildMarkdown(doc: FicheDoc): string {
  const out: string[] = [`# ${doc.title}`]
  if (doc.subtitle) out.push('', `_${doc.subtitle}_`)
  if (doc.pills?.length) out.push('', doc.pills.map(p => `\`${pillText(p)}\``).join(' '))
  for (const s of doc.sections) {
    out.push('', `## ${s.title}`)
    if (s.rows?.length) for (const r of s.rows) out.push(`- **${r.label}** : ${r.value}`)
    if (s.lines?.length) for (const l of s.lines) out.push(`- ${l}`)
    if (!s.rows?.length && !s.lines?.length) out.push('_—_')
  }
  return out.join('\n') + '\n'
}

export function exportMarkdown(doc: FicheDoc, filename?: string) {
  triggerDownload(new Blob([buildMarkdown(doc)], { type: 'text/markdown;charset=utf-8' }), `${filename ?? slug(doc.title)}.md`)
}

// ---------- ODT (OpenDocument Text, LibreOffice) ----------
function buildOdtContent(doc: FicheDoc): string {
  const p = (text: string, style?: string) => `<text:p${style ? ` text:style-name="${style}"` : ''}>${text}</text:p>`
  const body: string[] = [p(esc(doc.title), 'Titre')]
  if (doc.subtitle) body.push(p(esc(doc.subtitle), 'SousTitre'))
  if (doc.pills?.length) body.push(p(doc.pills.map(x => esc(pillText(x))).join('  •  '), 'Pills'))
  for (const s of doc.sections) {
    body.push(`<text:h text:style-name="Titre2" text:outline-level="2">${esc(s.title)}</text:h>`)
    if (s.rows?.length) for (const r of s.rows) body.push(p(`<text:span text:style-name="Gras">${esc(r.label)} : </text:span>${esc(r.value)}`))
    if (s.lines?.length) for (const l of s.lines) body.push(p(`• ${esc(l)}`))
    if (!s.rows?.length && !s.lines?.length) body.push(p('—'))
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:automatic-styles>
<style:style style:name="Titre" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.15cm"/><style:text-properties fo:font-size="22pt" fo:font-weight="bold"/></style:style>
<style:style style:name="SousTitre" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="11pt" fo:color="#555555"/></style:style>
<style:style style:name="Pills" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.4cm"/><style:text-properties fo:font-size="10pt" fo:color="#0f7d4d"/></style:style>
<style:style style:name="Titre2" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.15cm" fo:border-bottom="0.5pt solid #cccccc" fo:padding-bottom="0.1cm"/><style:text-properties fo:font-size="13pt" fo:font-weight="bold" fo:color="#0f7d4d"/></style:style>
<style:style style:name="Gras" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
</office:automatic-styles>
<office:body><office:text>
${body.join('\n')}
</office:text></office:body>
</office:document-content>`
}

export async function exportOdt(doc: FicheDoc, filename?: string) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', buildOdtContent(doc))
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`)
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
  triggerDownload(blob, `${filename ?? slug(doc.title)}.odt`)
}

// ---------- PDF (téléchargement direct, mise en page proche de la fiche) ----------
type RGB = [number, number, number]
const TONES: Record<string, { bg: RGB, fg: RGB, br: RGB }> = {
  gray: { bg: [241, 245, 249], fg: [71, 85, 105], br: [203, 213, 225] },
  primary: { bg: [236, 253, 243], fg: [15, 125, 77], br: [167, 224, 194] },
  red: { bg: [254, 242, 242], fg: [185, 28, 28], br: [254, 202, 202] },
  orange: { bg: [255, 247, 237], fg: [194, 65, 12], br: [254, 215, 170] },
  amber: { bg: [255, 251, 235], fg: [180, 83, 9], br: [253, 230, 138] },
  emerald: { bg: [236, 253, 245], fg: [4, 120, 87], br: [167, 243, 208] },
  blue: { bg: [239, 246, 255], fg: [29, 78, 216], br: [191, 219, 254] },
  purple: { bg: [250, 245, 255], fg: [126, 34, 206], br: [233, 213, 255] },
}
const tone = (t: string) => TONES[t] ?? TONES.primary!

export async function exportPdf(doc: FicheDoc, filename?: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, PW = 210 - 2 * M, PH = 297, PAD = 5, LABELW = 52
  const primary: RGB = [15, 125, 77]
  const gray: RGB = [100, 116, 139]
  const dark: RGB = [15, 23, 42]
  const border: RGB = [224, 231, 236]
  const lh = (s: number) => s * 0.3528 * 1.16
  let y = M

  const font = (size: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
  }
  const wrap = (s: string, w: number) => pdf.splitTextToSize(s || '', w) as string[]

  // Rangs de pills (nombre de lignes) pour une largeur donnée.
  const pillRows = (pills: FichePill[], availW: number) => {
    font(7.5, true)
    let rows = 1, x = 0
    for (const p of pills) {
      const w = pdf.getTextWidth(pillText(p).toUpperCase()) + 6
      if (x + w > availW && x > 0) {
        rows++
        x = 0
      }
      x += w + 2.5
    }
    return rows
  }
  // Dessine les pills, retourne le y après.
  const drawPills = (pills: FichePill[], x0: number, y0: number, availW: number) => {
    font(7.5, true)
    let x = x0, ly = y0
    for (const p of pills) {
      const t = pillText(p).toUpperCase()
      const w = pdf.getTextWidth(t) + 6
      if (x + w > x0 + availW && x > x0) {
        x = x0
        ly += 6
      }
      const c = tone(pillTone(p))
      pdf.setFillColor(...c.bg)
      pdf.setDrawColor(...c.br)
      pdf.setLineWidth(0.2)
      pdf.roundedRect(x, ly, w, 5, 1.3, 1.3, 'FD')
      pdf.setTextColor(...c.fg)
      pdf.text(t, x + 3, ly + 3.5)
      x += w + 2.5
    }
    return ly + 5
  }

  // ---- BANDEAU ----
  const innerW = PW - 2 * PAD
  font(17, true)
  const titleLines = wrap(doc.title, innerW)
  font(9.5)
  const subLines = doc.subtitle ? wrap(doc.subtitle, innerW) : []
  const pRows = doc.pills?.length ? pillRows(doc.pills, innerW) : 0
  const bannerH = PAD + titleLines.length * lh(17)
    + (subLines.length ? 2 + subLines.length * lh(9.5) : 0)
    + (pRows ? 4 + pRows * 6 : 0) + PAD
  pdf.setFillColor(240, 253, 244)
  pdf.setDrawColor(...tone('primary').br)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(M, y, PW, bannerH, 3, 3, 'FD')
  let by = y + PAD
  font(17, true)
  pdf.setTextColor(...dark)
  for (const ln of titleLines) {
    by += lh(17)
    pdf.text(ln, M + PAD, by)
  }
  if (subLines.length) {
    by += 2
    font(9.5)
    pdf.setTextColor(...gray)
    for (const ln of subLines) {
      by += lh(9.5)
      pdf.text(ln, M + PAD, by)
    }
  }
  if (pRows) {
    by += 4
    by = drawPills(doc.pills!, M + PAD, by, innerW)
  }
  y += bannerH

  // ---- SECTIONS (cartes) ----
  const cw = PW - 2 * PAD
  const sectionH = (s: FicheSection) => {
    let h = PAD + lh(11) + 3
    for (const r of s.rows ?? []) h += Math.max(1, wrap(r.value || '—', cw - LABELW).length) * lh(9)
    for (const l of s.lines ?? []) h += wrap('•  ' + l, cw).length * lh(9)
    if (!s.rows?.length && !s.lines?.length) h += lh(9)
    return h + PAD
  }
  const drawSection = (s: FicheSection, cy: number, h: number) => {
    pdf.setFillColor(255, 255, 255)
    pdf.setDrawColor(...border)
    pdf.setLineWidth(0.3)
    pdf.roundedRect(M, cy, PW, h, 2.5, 2.5, 'FD')
    let ly = cy + PAD
    font(11, true)
    pdf.setTextColor(...primary)
    ly += lh(11)
    pdf.text(s.title, M + PAD, ly)
    ly += 1.5
    pdf.setDrawColor(...border)
    pdf.setLineWidth(0.2)
    pdf.line(M + PAD, ly, M + PW - PAD, ly)
    ly += 1.5
    font(9)
    for (const r of s.rows ?? []) {
      const vLines = wrap(r.value || '—', cw - LABELW)
      const top = ly
      pdf.setTextColor(...gray)
      pdf.text(r.label, M + PAD, top + lh(9))
      pdf.setTextColor(...dark)
      let vy = top
      for (const vl of vLines) {
        vy += lh(9)
        pdf.text(vl, M + PAD + LABELW, vy)
      }
      ly = Math.max(top + lh(9), vy)
    }
    for (const l of s.lines ?? []) {
      pdf.setTextColor(...dark)
      for (const ln of wrap('•  ' + l, cw)) {
        ly += lh(9)
        pdf.text(ln, M + PAD, ly)
      }
    }
    if (!s.rows?.length && !s.lines?.length) {
      pdf.setTextColor(...gray)
      ly += lh(9)
      pdf.text('—', M + PAD, ly)
    }
  }

  for (const s of doc.sections) {
    const h = sectionH(s)
    y += 5
    if (h <= PH - 2 * M) {
      if (y + h > PH - M) {
        pdf.addPage()
        y = M
      }
      drawSection(s, y, h)
      y += h
    }
    else {
      // Section trop haute pour une page : rendu au fil (sans cadre).
      if (y + 20 > PH - M) {
        pdf.addPage()
        y = M
      }
      font(11, true)
      pdf.setTextColor(...primary)
      y += lh(11)
      pdf.text(s.title, M, y)
      y += 2
      font(9)
      pdf.setTextColor(...dark)
      for (const r of s.rows ?? []) {
        for (const vl of wrap(`${r.label} : ${r.value || '—'}`, PW)) {
          if (y + lh(9) > PH - M) {
            pdf.addPage()
            y = M
          }
          y += lh(9)
          pdf.text(vl, M, y)
        }
      }
      for (const l of s.lines ?? []) {
        for (const vl of wrap('•  ' + l, PW)) {
          if (y + lh(9) > PH - M) {
            pdf.addPage()
            y = M
          }
          y += lh(9)
          pdf.text(vl, M, y)
        }
      }
    }
  }

  pdf.save(`${filename ?? slug(doc.title)}.pdf`)
}

export function exportFiche(format: 'md' | 'odt' | 'pdf', doc: FicheDoc, filename?: string) {
  if (format === 'md') return exportMarkdown(doc, filename)
  if (format === 'odt') return exportOdt(doc, filename)
  return exportPdf(doc, filename)
}
