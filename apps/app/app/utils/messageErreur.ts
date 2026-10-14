/**
 * LE MESSAGE QUE LE SERVEUR A ÉCRIT, pas celui que le client a inventé. `$fetch` lève une
 * erreur dont le `message` vaut « [POST] "…/api/x": 500 » : l'URL et le code, jamais la cause.
 */
export function messageErreur(e: unknown, defaut = 'Opération refusée.'): string {
  const d = (e as { data?: unknown })?.data
  if (typeof d === 'string' && d.trim()) return d
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>
    for (const champ of ['message', 'error', 'detail']) {
      const v = o[champ]
      if (typeof v === 'string' && v.trim()) return v
    }
  }
  const m = e instanceof Error ? e.message : ''
  // Le message par défaut de `$fetch` ne dit que l'URL et le code : inutile à l'écran.
  if (m && !/^\[\w+\]\s*".*":\s*\d+/.test(m)) return m
  const code = m.match(/:\s*(\d{3})\b/)?.[1]
  return code ? `${defaut} (code ${code})` : defaut
}
