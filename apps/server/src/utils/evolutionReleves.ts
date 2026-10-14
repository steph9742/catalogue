// CE QUI A CHANGÉ D'UN RELEVÉ AU SUIVANT — calcul pur, sans base. Séparé de la route pour être
// vérifiable : la seule propriété qui compte est qu'on n'annonce pas un changement qui n'a pas
// eu lieu.

export type TechnologieReleve = { produit: string, version: string | null, certitude: string }
export type EnTetesReleve = { hsts: boolean, csp: boolean, xFrameOptions: boolean, referrerPolicy: boolean }

export type Releve = {
  releveLe: string | Date
  statut: string
  codeHttp: number | null
  technologies: TechnologieReleve[] | null
  enTetes: EnTetesReleve | null
  certificatEmpreinte: string | null
}

export type Changement =
  | { nature: 'joignabilite', avant: string, apres: string }
  | { nature: 'code_http', avant: number | null, apres: number | null }
  | { nature: 'technologie_ajoutee', produit: string, version: string | null, certitude: string }
  | { nature: 'technologie_retiree', produit: string, version: string | null, certitude: string }
  | { nature: 'version_changee', produit: string, avant: string, apres: string }
  | { nature: 'entete_apparu', entete: keyof EnTetesReleve }
  | { nature: 'entete_disparu', entete: keyof EnTetesReleve }
  | { nature: 'certificat_remplace', avant: string, apres: string }

const ENTETES: (keyof EnTetesReleve)[] = ['hsts', 'csp', 'xFrameOptions', 'referrerPolicy']

/** Ce qui change entre deux relevés QUI ONT TOUS DEUX LU la page. */
function comparerLus(a: Releve, b: Releve): Changement[] {
  const out: Changement[] = []
  if (a.codeHttp !== b.codeHttp) out.push({ nature: 'code_http', avant: a.codeHttp, apres: b.codeHttp })

  const avant = new Map((a.technologies ?? []).map(t => [t.produit, t]))
  const apres = new Map((b.technologies ?? []).map(t => [t.produit, t]))
  for (const [produit, t] of apres) {
    const p = avant.get(produit)
    if (!p) out.push({ nature: 'technologie_ajoutee', produit, version: t.version, certitude: t.certitude })
    // UNE VERSION QUI DEVIENT INCONNUE N'EST PAS UNE VERSION QUI CHANGE. Une sonde qui
    // n'a pas répondu à temps rend `null` : l'annoncer ferait clignoter la fiche.
    else if (p.version && t.version && p.version !== t.version) {
      out.push({ nature: 'version_changee', produit, avant: p.version, apres: t.version })
    }
  }
  for (const [produit, t] of avant) {
    if (!apres.has(produit)) out.push({ nature: 'technologie_retiree', produit, version: t.version, certitude: t.certitude })
  }

  if (a.enTetes && b.enTetes) {
    for (const e of ENTETES) {
      if (!a.enTetes[e] && b.enTetes[e]) out.push({ nature: 'entete_apparu', entete: e })
      if (a.enTetes[e] && !b.enTetes[e]) out.push({ nature: 'entete_disparu', entete: e })
    }
  }
  return out
}

/**
 * Les changements de chaque relevé, dans l'ordre CHRONOLOGIQUE reçu. Le premier relevé n\'a rien
 * à quoi se comparer : aucun changement, et non « tout est nouveau » — sinon le premier passage
 * sur un parc de six cents sites ressemblerait à six cents mises en production.
 */
export function evolution<R extends Releve>(releves: readonly R[]): Array<R & { changements: Changement[] }> {
  let precedent: Releve | null = null
  let dernierLu: Releve | null = null
  let dernierCertificat: string | null = null

  return releves.map((r) => {
    const changements: Changement[] = []
    if (precedent && precedent.statut !== r.statut) {
      changements.push({ nature: 'joignabilite', avant: precedent.statut, apres: r.statut })
    }
    const lu = r.statut === 'ok' && r.technologies !== null
    if (lu && dernierLu) changements.push(...comparerLus(dernierLu, r))

    // Le certificat se lit indépendamment de la page : un service peut refuser la requête
    // HTTP et présenter son certificat. Même règle : on compare au dernier LU.
    if (r.certificatEmpreinte) {
      if (dernierCertificat && dernierCertificat !== r.certificatEmpreinte) {
        changements.push({ nature: 'certificat_remplace', avant: dernierCertificat, apres: r.certificatEmpreinte })
      }
      dernierCertificat = r.certificatEmpreinte
    }

    precedent = r
    if (lu) dernierLu = r
    return { ...r, changements }
  })
}
