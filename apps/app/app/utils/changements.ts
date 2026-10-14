// UN CHANGEMENT DE RELEVÉ EN UNE PHRASE — écrit une fois pour la fiche d'un site et le
// tableau de bord de l'audit. Le ton indique ce qui appelle un regard, pas un jugement.
export type ChangementReleve = {
  nature: string
  produit?: string
  version?: string | null
  avant?: string | number | null
  apres?: string | number | null
  entete?: string
}

const ENTETE: Record<string, string> = {
  hsts: 'HSTS', csp: 'Content-Security-Policy', xFrameOptions: 'X-Frame-Options', referrerPolicy: 'Referrer-Policy',
}

export function decrireChangement(c: ChangementReleve): { texte: string, ton: string } {
  switch (c.nature) {
    case 'version_changee': return { texte: `${c.produit} : ${c.avant} → ${c.apres}`, ton: 'blue' }
    case 'technologie_ajoutee': return { texte: `${c.produit}${c.version ? ` ${c.version}` : ''} détecté`, ton: 'blue' }
    case 'technologie_retiree': return { texte: `${c.produit} n'est plus détecté`, ton: 'gray' }
    case 'entete_apparu': return { texte: `${ENTETE[c.entete ?? ''] ?? c.entete} ajouté`, ton: 'emerald' }
    case 'entete_disparu': return { texte: `${ENTETE[c.entete ?? ''] ?? c.entete} retiré`, ton: 'amber' }
    case 'certificat_remplace': return { texte: 'Certificat remplacé', ton: 'blue' }
    case 'code_http': return { texte: `Code HTTP ${c.avant ?? '—'} → ${c.apres ?? '—'}`, ton: 'amber' }
    case 'joignabilite': return c.apres === 'echec'
      ? { texte: 'Devenu injoignable', ton: 'red' }
      : { texte: 'De nouveau joignable', ton: 'emerald' }
    default: return { texte: c.nature, ton: 'gray' }
  }
}
