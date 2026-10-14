import { catalogues } from './catalogues'
import {
  labelOf, type EnumOption,
  appCategories, appCriticites, appStatuts, appHebergements, appExpositions,
  appSensibilites, appMaintenances, authMethodes,
  tiersTypes, tiersNiveauAcces,
  logicielCategories, logicielLicences, logicielInstallations, logicielStatuts,
} from './catalogueEnums'

type FieldDesc = { key: string, label: string, options?: EnumOption[], bool?: boolean }

// Champs des catalogues à fiche dédiée (générique → tiré du registre).
const SPECIAL: Record<string, FieldDesc[]> = {
  applications: [
    { key: 'nom', label: 'Nom' },
    { key: 'description', label: 'Description' },
    { key: 'categorie', label: 'Catégorie', options: appCategories },
    { key: 'categoriePrecision', label: 'Catégorie (précision)' },
    { key: 'criticite', label: 'Criticité', options: appCriticites },
    { key: 'statut', label: 'Statut', options: appStatuts },
    { key: 'hebergement', label: 'Hébergement', options: appHebergements },
    { key: 'exposition', label: 'Exposition', options: appExpositions },
    { key: 'sensibilite', label: 'Sensibilité', options: appSensibilites },
    { key: 'donneesPersonnelles', label: 'Données personnelles', bool: true },
    { key: 'authentification', label: 'Authentification', options: authMethodes },
    { key: 'authentificationAutre', label: 'Autre authentification' },
    { key: 'openSource', label: 'Open source', bool: true },
    { key: 'devInterne', label: 'Développement interne', bool: true },
    { key: 'maintenueAJour', label: 'Mise à jour', options: appMaintenances },
    { key: 'url', label: 'URL de l\'application' },
    { key: 'siteWeb', label: 'Site web du produit' },
    { key: 'depotUrl', label: 'Dépôt Git' },
    { key: 'dateMiseEnService', label: 'Mise en service' },
    { key: 'dateFinDeSupport', label: 'Fin de support' },
    { key: 'homologuee', label: 'Homologuée', bool: true },
    { key: 'dateHomologation', label: 'Date d\'homologation' },
    { key: 'dateRevueHomologation', label: 'Prochaine revue' },
    // Volet RGPD — champs pointés produits par le diff d'audit (« rgpd.aipdStatut »).
    { key: 'rgpd.aipdStatut', label: 'Analyse d\'impact — statut', options: [
      { value: 'non_requise', label: 'Non requise' }, { value: 'a_faire', label: 'À faire' },
      { value: 'en_cours', label: 'En cours' }, { value: 'terminee', label: 'Terminée' },
    ] },
    { key: 'rgpd.aipdMotif', label: 'Analyse d\'impact — motif', options: [
      { value: 'evaluation_scoring', label: 'Évaluation ou notation' },
      { value: 'decision_automatisee', label: 'Décision automatisée' },
      { value: 'surveillance_systematique', label: 'Surveillance systématique' },
      { value: 'donnees_sensibles', label: 'Données sensibles' },
      { value: 'grande_echelle', label: 'Grande échelle' },
      { value: 'croisement_donnees', label: 'Croisement de données' },
      { value: 'personnes_vulnerables', label: 'Personnes vulnérables' },
      { value: 'usage_innovant', label: 'Usage innovant' },
      { value: 'liste_cnil', label: 'Liste CNIL' }, { value: 'autre', label: 'Autre' },
    ] },
    { key: 'rgpd.aipdMotifPrecision', label: 'Analyse d\'impact — précision du motif' },
    { key: 'rgpd.aipdConclusion', label: 'Analyse d\'impact — conclusion', options: [
      { value: 'risque_acceptable', label: 'Risque acceptable' },
      { value: 'acceptable_sous_reserve', label: 'Sous réserve des mesures' },
      { value: 'risque_eleve_consultation', label: 'Risque élevé — consultation CNIL' },
      { value: 'traitement_modifie', label: 'Traitement modifié' },
    ] },
    { key: 'rgpd.aipdConclusionDetail', label: 'Analyse d\'impact — détail' },
    { key: 'rgpd.aipdDate', label: 'Analyse d\'impact — date' },
    { key: 'rgpd.aipdRevueDate', label: 'Analyse d\'impact — réexamen' },
    { key: 'rgpd.notes', label: 'Notes RGPD' },
    { key: 'rgpd', label: 'Volet RGPD' },
    { key: 'rgpdExigences', label: 'Exigences RGPD évaluées' },
  ],
  tiers: [
    { key: 'nom', label: 'Nom' },
    { key: 'type', label: 'Type', options: tiersTypes },
    { key: 'activite', label: 'Activité' },
    { key: 'contratRef', label: 'Contrat' },
    { key: 'contratFin', label: 'Fin de contrat' },
    { key: 'niveauAcces', label: 'Niveau d\'accès', options: tiersNiveauAcces },
    { key: 'notesSecurite', label: 'Notes sécurité' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'referents', label: 'Référents' },
  ],
  postes: [
    { key: 'nom', label: 'Nom' },
    { key: 'editeur', label: 'Éditeur' },
    { key: 'version', label: 'Version' },
    { key: 'categorie', label: 'Catégorie', options: logicielCategories },
    { key: 'categoriePrecision', label: 'Catégorie (précision)' },
    { key: 'typeLicence', label: 'Licence', options: logicielLicences },
    { key: 'typeLicencePrecision', label: 'Licence (précision)' },
    { key: 'installation', label: 'Installation', options: logicielInstallations },
    { key: 'statut', label: 'Statut', options: logicielStatuts },
    { key: 'url', label: 'Lien éditeur' },
    { key: 'description', label: 'Description' },
    { key: 'notes', label: 'Notes' },
    { key: 'populationIds', label: 'Populations autorisées' },
  ],
}

// Champs descriptifs d'une catégorie (config dédiée SPECIAL, sinon registre générique).
export function fieldsForCategory(category: string): FieldDesc[] {
  return SPECIAL[category]
    ?? (catalogues[category]?.fields.flatMap((f) => {
      const base: FieldDesc = { key: f.key, label: f.label, options: f.options, bool: f.type === 'checkbox' }
      return f.autreKey ? [base, { key: f.autreKey, label: `${f.label} (précision)` }] : [base]
    }) ?? [])
}

// Majuscule initiale — sauf pour les URL / e-mails, qu'on laisse tels quels.
const capitalize = (s: string): string =>
  (/^(https?:\/\/|www\.|mailto:)/i.test(s) || /^\S+@\S+\.\S+$/.test(s))
    ? s
    : s.charAt(0).toUpperCase() + s.slice(1)

// Un objet (élément de relation dans un diff d'audit) se rend en paires « clé : valeur »,
// identifiants techniques omis — « etat : non_conforme, justification : … » dit ce qui a
// changé, « [object Object] » ne dit rien.
const CLES_MUETTES = new Set(['id', 'exigenceRgpdId', 'serveurId', 'personneId', 'applicationId'])
const formatItem = (x: unknown): string => {
  if (x === null || typeof x !== 'object') return String(x)
  return Object.entries(x as Record<string, unknown>)
    .filter(([k, val]) => val !== null && val !== undefined && val !== '' && !CLES_MUETTES.has(k))
    .map(([k, val]) => `${k} : ${val}`)
    .join(', ') || '(vide)'
}

const formatValue = (f: FieldDesc | undefined, v: unknown): string => {
  if (v == null || v === '') return '—'
  if (f?.bool) return v ? 'Oui' : 'Non'
  if (Array.isArray(v)) {
    if (!v.length) return '—'
    if (v.some(x => x !== null && typeof x === 'object')) return v.map(formatItem).join(' · ')
    return capitalize(f?.options ? v.map(x => labelOf(f.options!, String(x))).join(', ') : v.join(', '))
  }
  if (typeof v === 'object') return formatItem(v)
  if (f?.options) return capitalize(labelOf(f.options, String(v)))
  return capitalize(String(v))
}

// Import tolérant : convertit un libellé (ou « oui/non ») en valeur technique attendue
// par l'API, pour permettre de réimporter un fichier exporté (qui contient des libellés).
export function coerceImportValue(category: string, key: string, cell: unknown): unknown {
  const f = fieldsForCategory(category).find(x => x.key === key)
  if (!f) return cell
  const s = String(cell ?? '').trim()
  if (f.bool) {
    const low = s.toLowerCase()
    if (['oui', 'true', '1', 'vrai', 'x', 'yes'].includes(low)) return true
    if (['non', 'false', '0', 'faux', 'no', ''].includes(low)) return false
    return cell
  }
  if (f.options) {
    if (!s) return cell
    if (f.options.some(o => o.value === s)) return s
    const base = s.includes(' : ') ? s.split(' : ')[0]!.trim() : s
    const m = f.options.find(o => o.label.toLowerCase() === base.toLowerCase())
      ?? f.options.find(o => o.value.toLowerCase() === base.toLowerCase())
    return m ? m.value : cell
  }
  return cell
}

// Formate un changement d'audit { field, from, to } en libellé + valeurs lisibles.
export function describeChange(category: string, field: string, from: unknown, to: unknown): { label: string, from: string, to: string } {
  const f = fieldsForCategory(category).find(x => x.key === field)
  return { label: f?.label ?? field, from: formatValue(f, from), to: formatValue(f, to) }
}

// Rend un payload en liste { label, valeur } lisible.
export function describePayload(category: string, payload: Record<string, unknown> | null): { label: string, value: string }[] {
  if (!payload) return []
  const fields = fieldsForCategory(category)

  const out: { label: string, value: string }[] = []
  for (const f of fields) {
    if (!(f.key in payload)) continue
    const v = payload[f.key]
    if (v == null || v === '') continue
    let value: string
    if (f.bool) value = v ? 'Oui' : 'Non'
    else if (Array.isArray(v)) {
      if (f.options) value = v.map(x => labelOf(f.options!, String(x))).join(', ')
      else if (v.length && typeof v[0] === 'object') value = `${v.length} élément(s)`
      else value = v.join(', ')
    }
    else if (f.options) value = labelOf(f.options, String(v))
    else value = String(v)
    out.push({ label: f.label, value: capitalize(value) })
  }
  return out
}
