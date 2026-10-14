// EXTRACTION DES CODES D'UNITÉ DEPUIS L'ANNUAIRE. Séparé du client LDAP pour être vérifiable
// sans réseau ni compte de service : toutes les règles délicates sont ici, et aucune ne demande
// une connexion pour être éprouvée.

/**
 * Le code de composante, extrait de `ufcCodeComposanteAff` ou de `supannEntiteAffectation`.
 */
const MOTIF_COMPOSANTE = /^cmp[iag]-(\d{3})$/i

export function codeComposante(valeur: string | null | undefined): string | null {
  const v = (valeur ?? '').trim()
  if (!v) return null
  // Le code nu, tel que `ufcCodeComposanteAff` le rend.
  if (/^\d{3}$/.test(v)) return v
  // « UFC » désigne l'établissement entier ; il est dans la table au même titre.
  if (/^ufc$/i.test(v)) return 'UFC'
  return v.match(MOTIF_COMPOSANTE)?.[1] ?? null
}

/**
 * Le préfixe brut — `cmpi`, `cmpa`, `cmpg` — CONSERVÉ ET JAMAIS TRADUIT.
 */
export function prefixeAffectation(valeur: string | null | undefined): string | null {
  return (valeur ?? '').trim().match(/^(cmp[iag])-\d{3}$/i)?.[1]?.toLowerCase() ?? null
}

/**
 * Le code d'unité de recherche, en tête de `ufcUniteRecherche`. LA FORME VARIE, et un motif à
 * quatre chiffres perdrait la moitié du parc : quatre chiffres (`6174`), cinq (`24547`), un
 * zéro initial qui compte (`0481`), un préfixe de dispositif (`EA4267`), un suffixe (`1347JD`).
 */
const MOTIF_UNITE = /^([A-Z]{0,2}\d{3,5}[A-Z]{0,2})\s/

export function codeUniteRecherche(valeur: string | null | undefined): string | null {
  // La coupe est indispensable : une valeur de l'annuaire commence par une TABULATION,
  // et sans elle « 4661 » devient une seconde unité à côté de la première.
  return (valeur ?? '').trim().match(MOTIF_UNITE)?.[1] ?? null
}

/**
 * Le sigle, quand l'annuaire en porte un. `null` sinon — et c\'est fréquent.
 */
export function sigleUniteRecherche(valeur: string | null | undefined): string | null {
  const apres = (valeur ?? '').trim().replace(MOTIF_UNITE, '')
  const premier = apres.split(/\s+/)[0] ?? ''
  if (premier.length < 2 || premier.length > 20) return null
  if (!/^[A-ZÀ-Ý0-9]+$/.test(premier)) return null
  // Une lettre minuscule dans le mot, ou une ponctuation collée : ce n'est pas un sigle.
  return premier
}

/**
 * L'intitulé, sans le code ni le sigle. Rendu pour information : c\'est la table de
 * correspondance qui porte l'intitulé FAISANT FOI, pas l\'annuaire.
 */
export function intituleUniteRecherche(valeur: string | null | undefined): string {
  const apres = (valeur ?? '').trim().replace(MOTIF_UNITE, '')
  const sigle = sigleUniteRecherche(valeur)
  return (sigle ? apres.slice(sigle.length) : apres).trim()
}

/**
 * Le code de composante porté par `ufcCodeService` — « 921-21SIG » → « 921 ».
 */
export function composanteDuService(valeur: string | null | undefined): string | null {
  return (valeur ?? '').trim().match(/^(\d{3})-/)?.[1] ?? null
}

/**
 * CE QUE `ufcService` DÉSIGNE — trois choses différentes selon la fiche.
 */
const MOTIF_DEPARTEMENT_SERVICE = /^\s*d[ée]partement\b/i

export function natureDuService(valeur: string | null | undefined): 'departement' | 'service' | null {
  const v = (valeur ?? '').trim()
  if (!v) return null
  return MOTIF_DEPARTEMENT_SERVICE.test(v) ? 'departement' : 'service'
}

/**
 * DÉCOMPOSE UN LIBELLÉ DE `ufcService` — nature, composante, nom de l'unité.
 */
export function decomposerService(
  libelle: string | null | undefined,
  nomsComposantes: readonly string[],
): { nature: 'service' | 'departement' | null, composante: string | null, unite: string | null } {
  const brut = (libelle ?? '').trim()
  if (!brut) return { nature: null, composante: null, unite: null }

  // Le mot « Département » qualifie la NATURE, il ne fait pas partie du nom — et il se place
  // indifféremment AVANT ou APRÈS le nom de la composante.
  const MOT = /(^|\s)(?:d[ée]partement|dept|dpt)[-\s]+/i
  let nature: 'service' | 'departement' | null = MOT.test(brut) ? 'departement' : 'service'
  const sansPrefixe = brut.replace(/^\s*(?:d[ée]partement|dept|dpt)[-\s]+/i, '').trim()

  // Du plus long au plus court : « UFR Sciences de la santé » doit gagner sur « UFR ».
  const candidats = [...nomsComposantes].sort((a, b) => b.length - a.length)
  /** Retire un « Département » restant en tête du NOM de l'unité, après la composante. */
  const nettoyer = (reste: string): string | null => {
    const sans = reste.replace(/^\s*(?:d[ée]partement|dept|dpt)[-\s]+/i, '').trim()
    return sans || null
  }

  for (const c of candidats) {
    if (sansPrefixe.toLowerCase() === c.toLowerCase()) {
      // Le libellé ne nomme que la composante : personne rattachée sans sous-unité.
      return { nature: null, composante: c, unite: null }
    }
    if (sansPrefixe.toLowerCase().startsWith(`${c.toLowerCase()} `)) {
      return { nature, composante: c, unite: nettoyer(sansPrefixe.slice(c.length)) }
    }
  }
  nature = MOT.test(sansPrefixe) ? 'departement' : nature
  // Aucune composante reconnue : le libellé entier est le nom de l'unité, et le
  // rattachement viendra d'ailleurs — de `ufcCodeService`, ou de la déclaration.
  return { nature, composante: null, unite: nettoyer(sansPrefixe) }
}

/**
 * LA MFA EST-ELLE ACTIVÉE ? La PRÉSENCE de l'attribut le dit, pas son contenu.
 */
export function mfaActif(valeurs: readonly string[] | undefined): boolean | null {
  if (valeurs === undefined) return null
  return valeurs.some(v => v.trim().length > 0)
}

/**
 * LA VALEUR PRINCIPALE d'un attribut multivalué. `supannEntiteAffectationPrincipale` la donne
 * quand elle existe.
 */
export function composantePrincipale(
  principale: string | null | undefined,
  toutes: readonly string[],
  codeDirect: string | null | undefined,
): string | null {
  // `ufcCodeComposanteAff` d'abord : c'est la source la plus directe, sans préfixe à lire.
  const direct = codeComposante(codeDirect)
  if (direct) return direct
  const dePrincipale = codeComposante(principale)
  if (dePrincipale) return dePrincipale
  for (const v of toutes) {
    const c = codeComposante(v)
    if (c) return c
  }
  return null
}
