<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import { appCriticites } from '~/utils/catalogueEnums'
// FICHE D'UN SERVICE EXPOSÉ — certificat, technologies, états. Ce que le résumé générique ne
// peut pas rendre : ces états viennent d'une jointure entre les détections et le référentiel de
// technologies, pas de colonnes.

type Techno = {
  id: string
  produit: string
  version: string | null
  certitude: 'certain' | 'probable' | 'absente'
  source: string
  technologieCle: string | null
  derniereVersionBranche: string | null
  derniereVersionGenerale: string | null
  eolStatut: string | null
  etatMiseAJour: string
}
type Fiche = {
  service: {
    id: string
    hote: string
    port: number
    libelle: string | null
    type: string
    dernierScanAt: string | null
    dernierMessage: string | null
    codeHttp: number | null
    hsts: boolean | null
    csp: boolean | null
    xFrameOptions: boolean | null
    referrerPolicy: boolean | null
    application: { id: string, nom: string } | null
    proprietaire: { id: string, nom: string, prenom: string | null } | null
    contactTechnique: { id: string, nom: string, prenom: string | null } | null
    prestataire: { id: string, nom: string } | null
    serveur: { id: string, hostname: string } | null
    criticite: string | null
    paiementEnLigne: boolean | null
    donneesPersonnelles: boolean | null
    justificationExposition: string | null
    dateRevue: string | null
    derniereRevueLe: string | null
    derniereRevuePar: string | null
    classement: string | null
    classementValidePar: string | null
    classementValideLe: string | null
    classementPropose: string | null
    classementPreuve: string | null
    classementProposeLe: string | null
    verificationInterieureLe: string | null
    verificationInterieurePar: string | null
    verificationInterieureMethode: string | null
    verificationInterieureNote: string | null
  }
  certificat: {
    dateFin: string | null
    dernierStatut: string
    chaineValide: boolean | null
    emetteur: string | null
    autorite: string | null
  } | null
  technologies: Techno[]
  etat: {
    etat: string
    surTechnologies: number
    verifiees: number
    partiel: boolean
    certificat: string
    jamaisScanne: boolean
  }
  regleAgregation: string
  exposition: { signalements: string[], moisDeRevue: number, pagesCibles: number }
}

const route = useRoute()
const api = useApi()
const perms = await usePermissions()
const modifiable = computed(() => perms.canPropose('sites-services'))

const busy = ref(false)

/**
 * Suppression. La confirmation nomme l'hôte : « Supprimer cette entrée ?
 */
const supprimer = async () => {
  if (!f.value) return
  if (!confirm(`Supprimer « ${f.value.service.hote} » de l'inventaire des sites et services ?\n\n`
    + 'Les technologies détectées sont supprimées avec lui. Le certificat reste inventorié.')) return
  const r = await api<{ queued?: boolean }>(`/api/sites-services/${f.value.service.id}`, { method: 'DELETE' })
  if (r?.queued) alert('Votre demande de suppression a été envoyée pour validation.')
  await navigateTo('/sites-services')
}

const { data: f, refresh } = await useAsyncData(
  () => `site-${route.params.id}`,
  () => api<Fiche>(`/api/sites-services/${route.params.id}/fiche`),
  { getCachedData: () => undefined },
)

// L'HÔTE dans l'onglet : c'est le nom du service exposé, et ce qu'on cherche des yeux
// quand on en compare plusieurs.
useHead({ title: () => f.value?.service.hote })

// L'HISTORIQUE À PART de la fiche : la fiche dit ce qui est, l'historique ce qui a changé.
// Un service sans historique (jamais relevé depuis l'ajout du suivi) garde sa fiche.
type Changement = ChangementReleve
type Releve = { id: string, releveLe: string, statut: string, codeHttp: number | null, message: string | null, changements: Changement[] }
const { data: historique, refresh: rafraichirHistorique } = await useAsyncData(
  () => `site-historique-${route.params.id}`,
  () => api<{ releves: Releve[], plusAnciens: boolean }>(`/api/sites-services/${route.params.id}/historique`).catch(() => null),
  { getCachedData: () => undefined },
)

// PROPRIÉTÉ ET EXPOSITION. Les signalements viennent du serveur (utils/classement.ts) : la
// fiche les lit, elle ne recalcule pas la règle.
const SIGNALEMENT: Record<string, { l: string, t: string }> = {
  sensible_sans_proprietaire: { l: 'Service sensible sans propriétaire', t: 'red' },
  sans_proprietaire: { l: 'Sans propriétaire', t: 'amber' },
  paiement_sans_surveillance_integrite: { l: 'Paiement sans page cible surveillée', t: 'red' },
  sensible_sans_justification: { l: 'Exposition non justifiée', t: 'amber' },
  revue_echue: { l: 'Revue d\'exposition échue', t: 'red' },
  revue_non_planifiee: { l: 'Revue non planifiée', t: 'amber' },
  classement_a_valider: { l: 'Classement proposé à valider', t: 'blue' },
}
const CLASSEMENT: Record<string, string> = { paiement: 'Paiement', sensible: 'Sensible', standard: 'Standard' }
const nomPersonne = (p: { nom: string, prenom: string | null } | null) => (p ? `${p.prenom ? `${p.prenom} ` : ''}${p.nom}` : null)
// `null` n'est pas « non » : un marqueur jamais renseigné se dit comme tel.
const ouiNon = (v: boolean | null) => (v === null ? 'non renseigné' : v ? 'oui' : 'non')
const libelleCriticite = (v: string | null) => (v ? appCriticites.find(o => o.value === v)?.label ?? v : null)

const choixClassement = ref('')
const justification = ref('')
watchEffect(() => {
  choixClassement.value = f.value?.service.classement ?? f.value?.service.classementPropose ?? ''
  justification.value = f.value?.service.justificationExposition ?? ''
})
const msgExposition = ref('')
const classer = async (valeur: string) => {
  busy.value = true
  msgExposition.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/sites-services/${route.params.id}/classement`, { method: 'POST', body: { classement: valeur } })
    msgExposition.value = r?.queued ? 'Classement envoyé pour validation.' : `Classement « ${CLASSEMENT[valeur] ?? valeur} » validé.`
    await refresh()
  }
  catch (e) { msgExposition.value = messageErreur(e, 'Le classement n\'a pas été enregistré.') }
  finally { busy.value = false }
}
// VÉRIFIÉ DE L'INTÉRIEUR. La méthode est exigée : une date sans méthode ne dit pas ce que
// vaut la vérification.
const verification = reactive({ methode: '', note: '' })
const enregistrerVerification = async () => {
  busy.value = true
  msgExposition.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/sites-services/${route.params.id}/verification-interieure`, {
      method: 'POST', body: { methode: verification.methode, note: verification.note || undefined },
    })
    msgExposition.value = r?.queued ? 'Vérification envoyée pour validation.' : 'Vérification de l\'intérieur enregistrée.'
    verification.methode = ''
    verification.note = ''
    await refresh()
  }
  catch (e) { msgExposition.value = messageErreur(e, 'La vérification n\'a pas été enregistrée.') }
  finally { busy.value = false }
}

const marquerRevu = async () => {
  busy.value = true
  msgExposition.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/sites-services/${route.params.id}/revue`, {
      method: 'POST', body: { justificationExposition: justification.value || undefined },
    })
    msgExposition.value = r?.queued ? 'Revue envoyée pour validation.' : 'Revue enregistrée.'
    await refresh()
  }
  catch (e) { msgExposition.value = messageErreur(e, 'La revue n\'a pas été enregistrée.') }
  finally { busy.value = false }
}

// PAGES CIBLES. Les scripts y sont relevés par le moteur d'audit ; la fiche déclare les
// pages, montre l'écart à la référence et fait valider cette référence.
type ScriptPage = { src: string | null, domaine: string | null, externe: boolean, sha256: string, integrity: boolean | null, etat: string }
type EcartScript = { nature: string, src: string | null, domaine: string | null }
type PageCible = {
  id: string
  url: string
  nature: string
  dernierReleveLe: string | null
  referenceValideeLe: string | null
  referenceValideePar: string | null
  referenceScripts: number
  csp: { etat: string, raisons: string[] }
  sri: { externes: number, avecIntegrity: number }
  scripts: ScriptPage[]
  ecarts: EcartScript[]
}
const { data: pages, refresh: rafraichirPages } = await useAsyncData(
  () => `site-pages-${route.params.id}`,
  () => api<PageCible[]>(`/api/sites-services/${route.params.id}/pages`).catch(() => null),
  { getCachedData: () => undefined },
)
// LES CONSTATS DU MOTEUR D'AUDIT, rattachés à ce service par l'hôte et le port au moment de la
// synchronisation.
type ConstatSite = {
  id: string
  categorie: string
  gravite: string
  statut: string
  titre: string
  reference: string | null
  observations: number
  dernierReleveLe: string
}
const { data: constats } = await useAsyncData(
  () => `site-constats-${route.params.id}`,
  () => api<{ total: number, resultats: ConstatSite[] }>('/api/audit-surface/constats', {
    query: { serviceId: String(route.params.id), statut: 'ouvert' },
  }).catch(() => null),
  { getCachedData: () => undefined },
)
const CATEGORIE_CONSTAT: Record<string, string> = {
  vulnerabilite: 'Vulnérabilité (CVE)', certificat: 'Certificat', tls: 'TLS', entete: 'En-têtes',
  fichier_expose: 'Fichier exposé', outil_expose: 'Outil exposé', version: 'Version', dns: 'DNS',
  reputation: 'Réputation', integrite_script: 'Intégrité des scripts', compromission: 'Compromission',
  classement: 'Classement', port: 'Port ouvert', decouverte: 'Découverte',
}
const TON_GRAVITE: Record<string, string> = {
  critique: 'red', elevee: 'red', moyenne: 'amber', faible: 'blue', info: 'gray',
}
const LIBELLE_GRAVITE: Record<string, string> = {
  critique: 'Critique', elevee: 'Élevée', moyenne: 'Moyenne', faible: 'Faible', info: 'Info',
}
// L'ordre du vocabulaire, pas l'ordre alphabétique : « critique » avant « élevée », et non
// « critique » avant « faible » avant « info ».
const RANG_GRAVITE = ['critique', 'elevee', 'moyenne', 'faible', 'info']
const constatsTries = computed(() => [...(constats.value?.resultats ?? [])]
  .sort((a, b) => RANG_GRAVITE.indexOf(a.gravite) - RANG_GRAVITE.indexOf(b.gravite)
    || b.dernierReleveLe.localeCompare(a.dernierReleveLe)))

// LES CVE À PART, ET PRÉSENTÉES COMME DES CVE. Un identifiant se lit, se recopie dans un ticket
// et se cherche dans un bulletin : noyé dans un intitulé de constat, il faut le repérer à
// l'œil.
const MOTIF_CVE = /CVE-\d{4}-\d{4,7}/g
const cvesDe = (c: ConstatSite) => [...new Set((c.reference ?? '').match(MOTIF_CVE) ?? [])]

const vulnerabilites = computed(() => constatsTries.value.flatMap(c =>
  cvesDe(c).map(cve => ({ cve, constat: c }))))
const autresConstats = computed(() => constatsTries.value.filter(c => cvesDe(c).length === 0))

// Le contexte d'une CVE : l'intitulé du constat, débarrassé du module et des identifiants
// qu'on affiche déjà en tête de ligne — sinon la même chaîne apparaît deux fois.
const contexteCve = (c: ConstatSite) => c.titre
  .replace(/^[a-z_]+\s+—\s+/i, '')
  .replace(MOTIF_CVE, '')
  .replace(/\(\s*\)|\[\s*\]/g, '')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')

const NATURE_PAGE: Record<string, string> = {
  paiement: 'Paiement', panier: 'Panier', connexion: 'Connexion', donnees_personnelles: 'Données personnelles', autre: 'Autre',
}
// NON RELEVÉE n'est pas ABSENTE, et PRÉSENTE n'est pas EFFECTIVE.
const CSP: Record<string, { l: string, t: string }> = {
  non_relevee: { l: 'CSP non relevée', t: 'gray' },
  absente: { l: 'CSP absente', t: 'red' },
  inoperante: { l: 'CSP sans effet sur les scripts', t: 'red' },
  faible: { l: 'CSP faible', t: 'amber' },
  effective: { l: 'CSP effective', t: 'emerald' },
}
const ETAT_SCRIPT: Record<string, { l: string, t: string }> = {
  sans_reference: { l: 'sans référence', t: 'gray' },
  conforme: { l: 'conforme', t: 'emerald' },
  modifie: { l: 'modifié', t: 'red' },
  nouveau: { l: 'nouveau', t: 'amber' },
}
const LIBELLE_ECART: Record<string, string> = {
  script_modifie: 'Modifié :', script_ajoute: 'Ajouté :', script_retire: 'Retiré :', nouveau_domaine_tiers: 'Nouveau domaine tiers :',
}
const nouvellePage = reactive({ url: '', nature: 'paiement' })
const msgPages = ref('')
const ajouterPage = async () => {
  busy.value = true
  msgPages.value = ''
  try {
    const r = await api<{ queued?: boolean }>(`/api/sites-services/${route.params.id}/pages`, {
      method: 'POST', body: { url: nouvellePage.url, nature: nouvellePage.nature },
    })
    msgPages.value = r?.queued ? 'Demande envoyée pour validation.' : 'Page ajoutée : elle sera relevée au prochain passage du moteur.'
    nouvellePage.url = ''
    await rafraichirPages()
  }
  catch (e) { msgPages.value = messageErreur(e, 'La page n\'a pas été ajoutée.') }
  finally { busy.value = false }
}
const retirerPage = async (p: PageCible) => {
  if (!confirm(`Retirer la page « ${p.url} » ?\n\nSa référence de scripts est supprimée avec elle. Les constats déjà levés restent.`)) return
  busy.value = true
  try {
    await api(`/api/sites-services/pages/${p.id}`, { method: 'DELETE' })
    await rafraichirPages()
  }
  catch (e) { msgPages.value = messageErreur(e, 'La page n\'a pas été retirée.') }
  finally { busy.value = false }
}
// VALIDER, C'EST DÉCIDER. Une page déjà compromise validée comme référence ferait du
// skimmer la norme : la confirmation le dit.
const validerReference = async (p: PageCible) => {
  if (!confirm(`Valider les ${p.scripts.length} script(s) servis au dernier relevé de ${p.url} comme référence ?\n\n`
    + 'Tout écart ultérieur lèvera un constat. Si un script actuel est déjà malveillant, il deviendra la référence : ne validez que ce qui a été vérifié.')) return
  busy.value = true
  try {
    await api(`/api/sites-services/pages/${p.id}/reference`, { method: 'POST' })
    msgPages.value = 'Référence validée.'
    await rafraichirPages()
  }
  catch (e) { msgPages.value = messageErreur(e, 'La référence n\'a pas été validée.') }
  finally { busy.value = false }
}

const relever = async () => {
  busy.value = true
  try {
    await api(`/api/sites-services/${route.params.id}/scan`, { method: 'POST' })
    await Promise.all([refresh(), rafraichirHistorique()])
  }
  finally { busy.value = false }
}

const TYPES: Record<string, string> = {
  web: 'Site web', messagerie: 'Messagerie', annuaire: 'Annuaire', autre: 'Autre service',
}

// QUATRE ÉTATS PAR PASTILLE, jamais deux. Sans le quatrième, un service jamais relevé
// s'afficherait en vert.
const MAJ: Record<string, { l: string, t: string }> = {
  a_jour: { l: 'À jour', t: 'emerald' },
  correctif_disponible: { l: 'Correctif disponible', t: 'amber' },
  non_maintenue: { l: 'Version non maintenue', t: 'red' },
  version_inconnue: { l: 'Version inconnue', t: 'gray' },
}
const EOL: Record<string, { l: string, t: string }> = {
  ok: { l: 'Support en cours', t: 'emerald' },
  supporte: { l: 'Support en cours', t: 'emerald' },
  bientot: { l: 'Fin de support sous 1 an', t: 'amber' },
  etendu: { l: 'Support étendu', t: 'blue' },
  depasse: { l: 'Hors support', t: 'red' },
  inconnu: { l: 'Support inconnu', t: 'gray' },
}
// L'ÉTAT DU CERTIFICAT, pas l'état du relevé. Un certificat expiré se lit parfaitement :
// dire « lu » d'un certificat périmé serait la bonne nouvelle à la place de la mauvaise.
const CERT: Record<string, { l: string, t: string }> = {
  valide: { l: 'Certificat valide', t: 'emerald' },
  expire_bientot: { l: 'Certificat expire bientôt', t: 'amber' },
  expire: { l: 'Certificat expiré', t: 'red' },
  invalide: { l: 'Certificat invalide', t: 'red' },
  injoignable: { l: 'Hôte injoignable', t: 'amber' },
  jamais_releve: { l: 'Certificat jamais relevé', t: 'gray' },
  aucun: { l: 'Aucun certificat', t: 'gray' },
}
const CERTITUDE: Record<string, string> = {
  certain: 'annoncée', probable: 'déduite', absente: 'masquée',
}

// Le pire statut de support parmi les technologies : la même règle que côté serveur.
const supportGlobal = computed(() => {
  const s = (f.value?.technologies ?? []).map(t => t.eolStatut).filter(Boolean) as string[]
  if (!s.length) return null
  for (const pire of ['depasse', 'etendu', 'bientot', 'inconnu']) if (s.includes(pire)) return pire
  return 'ok'
})

/**
 * POURQUOI une technologie n'est pas vérifiée. Deux causes, deux suites très différentes :
 * masquer sa version est une bonne pratique du site et n'appelle rien de notre part ; l'absence
 * de référence est une lacune de NOTRE référentiel, et se comble.
 */
const nonVerifiees = computed(() => {
  const t = (f.value?.technologies ?? []).filter(x => x.etatMiseAJour === 'version_inconnue')
  const masquees = t.filter(x => !x.version).map(x => x.produit)
  const sansReference = t.filter(x => x.version && !x.derniereVersionBranche).map(x => x.produit)
  const bouts = [
    masquees.length ? `${masquees.join(', ')} ne publie${masquees.length > 1 ? 'nt' : ''} pas sa version` : '',
    sansReference.length ? `${sansReference.join(', ')} n'a pas de version de référence dans le catalogue` : '',
  ].filter(Boolean)
  return bouts.length ? `${bouts.join(' ; ')}.` : null
})

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null
</script>

<template>
  <div
    v-if="f"
    class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500"
  >
    <NuxtLink
      to="/sites-services"
      class="inline-flex items-center gap-1.5 text-sm text-secondary-500 hover:text-secondary-800"
    >
      <Icon
        name="lucide:arrow-left"
        class="size-4"
      /> Sites et services
    </NuxtLink>

    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <UITitle class="tracking-tight text-secondary-900">
          {{ f.service.hote }}<span
            v-if="f.service.port !== 443"
            class="text-secondary-400"
          >:{{ f.service.port }}</span>
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          {{ TYPES[f.service.type] ?? f.service.type }}
          <template v-if="f.service.application">
            — <NuxtLink
              :to="`/applications/${f.service.application.id}`"
              class="text-primary-700 hover:underline"
            >{{ f.service.application.nom }}</NuxtLink>
          </template>
          <!-- Le rattachement est FACULTATIF : son absence est dite, jamais présentée
               comme une lacune. -->
          <template v-else>
            — non rattaché à une application
          </template>
        </p>
      </div>
      <UIButton
        :disabled="busy"
        @click="relever"
      >
        <Icon
          name="lucide:radar"
          class="size-4"
        /> {{ busy ? 'Relevé…' : 'Relever' }}
      </UIButton>
      <template v-if="modifiable">
        <!-- `UIButton` rend un <button>, pas un lien : `to` n'y aurait rien déclenché. -->
        <UIButton
          variant="ghost"
          @click="navigateTo(`/sites-services/${f.service.id}/edit`)"
        >
          <Icon
            name="lucide:pencil"
            class="size-4"
          /> Modifier
        </UIButton>
        <UIButton
          variant="ghost"
          class="text-red-600 hover:bg-red-50"
          @click="supprimer"
        >
          <Icon
            name="lucide:trash-2"
            class="size-4"
          /> Supprimer
        </UIButton>
      </template>
    </header>

    <!-- LES TROIS PASTILLES. Un service jamais relevé les affiche toutes en « inconnu ». -->
    <section class="flex flex-wrap items-center gap-2">
      <!-- Pas de fraction : « 2/3 » se lit comme une note, donc comme un échec sur la
           troisième. Elle n'est pas en retard, elle n'est pas mesurée. -->
      <Pill :tone="f.etat.partiel ? 'blue' : (MAJ[f.etat.etat]?.t ?? 'gray')">
        {{ f.etat.partiel
          ? `${f.etat.verifiees} à jour, ${f.etat.surTechnologies - f.etat.verifiees} non vérifiée${f.etat.surTechnologies - f.etat.verifiees > 1 ? 's' : ''}`
          : (MAJ[f.etat.etat]?.l ?? f.etat.etat) }}
      </Pill>
      <!-- SEULEMENT le dépassement. Au niveau du site, « fin sous 1 an » ou « support inconnu » sont des faits de technologie, pas un verdict sur le service : ils tiennent la place des deux pastilles qui, elles, appellent une action. -->
      <Pill
        v-if="supportGlobal === 'depasse'"
        :tone="EOL.depasse?.t ?? 'red'"
      >
        {{ EOL.depasse?.l ?? 'Hors support' }}
      </Pill>
      <Pill :tone="CERT[f.etat.certificat]?.t ?? 'gray'">
        {{ CERT[f.etat.certificat]?.l ?? f.etat.certificat }}
      </Pill>
      <!-- LE DÉNOMINATEUR, à côté des pastilles. « À jour » sur deux technologies détectées
           ne dit rien des autres, et l'afficher seul serait la réponse rassurante et fausse. -->
      <span class="text-xs text-secondary-500">
        sur {{ f.etat.surTechnologies }} technologie{{ f.etat.surTechnologies > 1 ? 's' : '' }} détectée{{ f.etat.surTechnologies > 1 ? 's' : '' }}
      </span>
    </section>

    <p
      v-if="nonVerifiees"
      class="text-xs text-secondary-500"
    >
      Non vérifié : {{ nonVerifiees }}
    </p>

    <p
      v-if="f.etat.jamaisScanne"
      class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Ce service n'a jamais été relevé. Les états ci-dessus valent « inconnu » : aucune conclusion
      ne peut en être tirée.
    </p>
    <p
      v-else-if="f.service.dernierMessage"
      class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Dernier relevé en échec : {{ f.service.dernierMessage }}. Les technologies ci-dessous datent
      d'un relevé antérieur.
    </p>

    <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-sm font-semibold text-secondary-900">
        Technologies détectées
      </h2>

      <div
        v-if="!f.technologies.length"
        class="text-sm text-secondary-500"
      >
        <!-- Sur un type autre que `web`, une liste vide est NORMALE. Le dire évite de lire
             une propriété du modèle comme un trou d'inventaire. -->
        <template v-if="f.service.type !== 'web'">
          Aucune technologie n'est attendue sur ce type de service.
        </template>
        <template v-else>
          Aucune technologie détectée. Cela ne signifie pas que le service n'en porte aucune :
          un proxy inverse qui supprime les en-têtes rend un site indétectable.
          <!-- LE CODE HTTP EST LE DIAGNOSTIC. Un pare-feu applicatif qui répond 403 à un agent inconnu rend une page sans aucun marqueur : le relevé « aboutit », et ne trouve rien. -->
          <template v-if="f.service.codeHttp && f.service.codeHttp >= 400">
            Le service a répondu <span class="font-mono">{{ f.service.codeHttp }}</span> :
            un pare-feu applicatif a pu répondre à sa place.
          </template>
          <template v-else-if="f.service.codeHttp">
            Réponse <span class="font-mono">{{ f.service.codeHttp }}</span>.
          </template>
        </template>
      </div>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full text-sm">
          <thead class="border-b border-secondary-100 text-left">
            <tr class="text-[11px] uppercase tracking-widest text-secondary-500">
              <th class="py-2 pr-3 font-medium">
                Produit
              </th>
              <th class="py-2 pr-3 font-medium">
                Version
              </th>
              <th class="py-2 pr-3 font-medium">
                Support
              </th>
              <th class="py-2 pr-3 font-medium">
                Branche
              </th>
              <th class="py-2 font-medium">
                Générale
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in f.technologies"
              :key="t.id"
              class="border-b border-secondary-50 last:border-0"
            >
              <td class="py-2 pr-3 font-medium text-secondary-900">
                {{ t.produit }}
              </td>
              <td class="py-2 pr-3 font-mono text-xs">
                <span :class="t.version ? 'text-secondary-800' : 'text-secondary-400'">{{ t.version ?? '—' }}</span>
                <!-- La certitude accompagne la version : une version déduite d'un chemin
                     d'actif n'est pas une déclaration du service. -->
                <span class="ml-1.5 font-sans text-[11px] text-secondary-400">{{ CERTITUDE[t.certitude] }}</span>
              </td>
              <td class="py-2 pr-3">
                <span :class="t.eolStatut === 'depasse' ? 'text-red-700' : 'text-secondary-600'">
                  {{ t.eolStatut ? (EOL[t.eolStatut]?.l ?? t.eolStatut) : 'Non rapproché' }}
                </span>
              </td>
              <td class="py-2 pr-3 font-mono text-xs text-secondary-600">
                {{ t.derniereVersionBranche ?? '—' }}
              </td>
              <td class="py-2 font-mono text-xs text-secondary-600">
                {{ t.derniereVersionGenerale ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-3 border-t border-secondary-100 pt-3 text-xs text-secondary-500">
        {{ f.regleAgregation }}
      </p>
    </section>

    <section class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold text-secondary-900">
          Certificat
        </h2>
        <dl
          v-if="f.certificat"
          class="space-y-1.5 text-sm"
        >
          <div class="flex justify-between gap-3">
            <dt class="text-secondary-500">
              Expire le
            </dt>
            <dd class="text-secondary-900">
              {{ fmt(f.certificat.dateFin) ?? 'inconnue' }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-secondary-500">
              Émetteur
            </dt>
            <dd class="truncate text-secondary-900">
              {{ f.certificat.emetteur ?? '—' }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-secondary-500">
              Autorité
            </dt>
            <dd :class="f.certificat.autorite ? '' : 'text-secondary-400'">
              <Pill
                v-if="f.certificat.autorite"
                :tone="AUTORITE_CERTIFICAT[f.certificat.autorite]?.t ?? 'gray'"
              >
                {{ AUTORITE_CERTIFICAT[f.certificat.autorite]?.l ?? f.certificat.autorite }}
              </Pill>
              <span v-else>non lue</span>
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-secondary-500">
              Chaîne
            </dt>
            <dd class="text-secondary-900">
              {{ f.certificat.chaineValide === null ? 'non vérifiée' : f.certificat.chaineValide ? 'valide' : 'incomplète' }}
            </dd>
          </div>
        </dl>
        <p
          v-else
          class="text-sm text-secondary-500"
        >
          Aucun certificat inventorié pour ce couple hôte et port.
        </p>
      </div>

      <div class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
        <h2 class="mb-3 text-sm font-semibold text-secondary-900">
          En-têtes de sécurité
        </h2>
        <!-- `null` = jamais relevé, `false` = relevé et absent. Confondre les deux ferait
             lire un service non relevé comme non conforme. -->
        <dl class="space-y-1.5 text-sm">
          <div
            v-for="h in [
              { l: 'HSTS', v: f.service.hsts },
              { l: 'Content-Security-Policy', v: f.service.csp },
              { l: 'X-Frame-Options', v: f.service.xFrameOptions },
              { l: 'Referrer-Policy', v: f.service.referrerPolicy },
            ]"
            :key="h.l"
            class="flex justify-between gap-3"
          >
            <dt class="text-secondary-500">
              {{ h.l }}
            </dt>
            <dd :class="h.v === null ? 'text-secondary-400' : h.v ? 'text-emerald-700' : 'text-amber-700'">
              {{ h.v === null ? 'jamais relevé' : h.v ? 'présent' : 'absent' }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- PROPRIÉTÉ ET EXPOSITION. Qui répond du service, pourquoi il est exposé, quand on le
         revoit. Les manques sont DITS : un propriétaire absent s'affiche, il ne se devine pas. -->
    <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
      <h2 class="mb-3 text-sm font-semibold text-secondary-900">
        Propriété et exposition
      </h2>
      <div
        v-if="f.exposition.signalements.length"
        class="mb-3 flex flex-wrap gap-1.5"
      >
        <Pill
          v-for="sg in f.exposition.signalements"
          :key="sg"
          :tone="SIGNALEMENT[sg]?.t ?? 'amber'"
        >
          {{ SIGNALEMENT[sg]?.l ?? sg }}
        </Pill>
      </div>
      <dl class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Propriétaire
          </dt>
          <dd :class="f.service.proprietaire ? 'text-secondary-900' : 'font-medium text-red-700'">
            {{ nomPersonne(f.service.proprietaire) ?? 'non désigné' }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Contact technique
          </dt>
          <dd class="text-secondary-900">
            {{ nomPersonne(f.service.contactTechnique) ?? '—' }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Hébergeur ou prestataire
          </dt>
          <dd class="text-secondary-900">
            <NuxtLink
              v-if="f.service.prestataire"
              :to="`/tiers/${f.service.prestataire.id}`"
              class="text-primary-700 hover:underline"
            >
              {{ f.service.prestataire.nom }}
            </NuxtLink>
            <span v-else>—</span>
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Serveur
          </dt>
          <dd class="text-secondary-900">
            <NuxtLink
              v-if="f.service.serveur"
              :to="`/serveurs/${f.service.serveur.id}`"
              class="text-primary-700 hover:underline"
            >
              {{ f.service.serveur.hostname }}
            </NuxtLink>
            <span v-else>—</span>
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Criticité
          </dt>
          <dd class="text-secondary-900">
            {{ libelleCriticite(f.service.criticite) ?? '—' }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Paiement en ligne · données personnelles
          </dt>
          <dd class="text-secondary-900">
            {{ ouiNon(f.service.paiementEnLigne) }} · {{ ouiNon(f.service.donneesPersonnelles) }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Classement
          </dt>
          <dd class="text-right text-secondary-900">
            {{ f.service.classement ? CLASSEMENT[f.service.classement] : 'non classé' }}
            <span
              v-if="f.service.classementValidePar"
              class="block text-xs text-secondary-500"
            >validé par {{ f.service.classementValidePar }} le {{ fmt(f.service.classementValideLe) }}</span>
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-secondary-500">
            Prochaine revue
          </dt>
          <dd class="text-right text-secondary-900">
            {{ f.service.dateRevue ? fmt(f.service.dateRevue) : 'non planifiée' }}
            <span
              v-if="f.service.derniereRevuePar"
              class="block text-xs text-secondary-500"
            >revu par {{ f.service.derniereRevuePar }} le {{ fmt(f.service.derniereRevueLe) }}</span>
          </dd>
        </div>
        <div class="flex justify-between gap-3 sm:col-span-2">
          <dt class="text-secondary-500">
            Vérifié de l'intérieur
          </dt>
          <dd
            class="text-right"
            :class="f.service.verificationInterieureLe ? 'text-secondary-900' : 'text-amber-700'"
          >
            <template v-if="f.service.verificationInterieureLe">
              oui, le {{ fmt(f.service.verificationInterieureLe) }} par {{ f.service.verificationInterieurePar }}
              <span class="block text-xs text-secondary-500">{{ f.service.verificationInterieureMethode }}{{ f.service.verificationInterieureNote ? ` — ${f.service.verificationInterieureNote}` : '' }}</span>
            </template>
            <!-- NON n'est pas « sain » ni « compromis » : c'est « on ne sait pas ». -->
            <template v-else>
              non — sans vérification côté serveur, rien ne permet de dire ce site sain
            </template>
          </dd>
        </div>
      </dl>
      <p
        v-if="f.service.justificationExposition"
        class="mt-3 text-sm text-secondary-700"
      >
        <span class="text-secondary-500">Justification de l'exposition :</span> {{ f.service.justificationExposition }}
      </p>

      <p
        v-if="f.service.classementPropose && f.service.classementPropose !== f.service.classement"
        class="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900"
      >
        Le moteur d'audit propose le classement « {{ CLASSEMENT[f.service.classementPropose] }} »
        (relevé le {{ fmt(f.service.classementProposeLe) }}){{ f.service.classementPreuve ? ` : ${f.service.classementPreuve}` : '' }}.
        Rien n'est déclenché tant qu'il n'est pas validé.
      </p>

      <div
        v-if="modifiable"
        class="mt-4 flex flex-wrap items-end gap-2 border-t border-secondary-100 pt-4"
      >
        <select
          v-model="choixClassement"
          class="rounded-lg border border-secondary-200 px-2 py-2 text-sm"
        >
          <option
            value=""
            disabled
          >
            Classement…
          </option>
          <option
            v-for="(l, k) in CLASSEMENT"
            :key="k"
            :value="k"
          >
            {{ l }}
          </option>
        </select>
        <UIButton
          variant="secondary"
          :disabled="busy || !choixClassement"
          @click="classer(choixClassement)"
        >
          Valider le classement
        </UIButton>
      </div>
      <div
        v-if="modifiable"
        class="mt-3 flex flex-wrap items-end gap-2"
      >
        <textarea
          v-model="justification"
          rows="2"
          placeholder="Pourquoi ce service est-il exposé sur Internet ?"
          class="min-w-72 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
        />
        <UIButton
          variant="secondary"
          :disabled="busy"
          @click="marquerRevu"
        >
          Marquer comme revu (prochaine revue dans {{ f.exposition.moisDeRevue }} mois)
        </UIButton>
      </div>
      <div
        v-if="modifiable"
        class="mt-3 flex flex-wrap items-end gap-2"
      >
        <input
          v-model="verification.methode"
          placeholder="Méthode : wp core verify-checksums, sommes Magento, surveillance Wazuh…"
          class="min-w-72 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
        >
        <input
          v-model="verification.note"
          placeholder="Résultat, en une phrase"
          class="min-w-48 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
        >
        <UIButton
          variant="secondary"
          :disabled="busy || !verification.methode.trim()"
          @click="enregistrerVerification"
        >
          Enregistrer une vérification de l'intérieur
        </UIButton>
      </div>
      <p
        v-if="msgExposition"
        class="mt-2 text-sm text-secondary-700"
      >
        {{ msgExposition }}
      </p>
    </section>

    <!-- CE QUE LE MOTEUR D'AUDIT A RELEVÉ SUR CE SERVICE. La même liste que la page Audit de surface, filtrée sur ce service : deux écrans qui compteraient chacun de leur côté finiraient par se contredire, et c'est l'écran le plus consulté qu'on croirait. -->
    <section
      v-if="constats"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm"
    >
      <h2 class="mb-1 text-sm font-semibold text-secondary-900">
        Vulnérabilités connues (CVE)
      </h2>
      <p class="mb-3 text-xs text-secondary-500">
        Relevées depuis Internet par le moteur d'audit. La gravité vient du score CVSS quand le relevé en porte un.
      </p>
      <p
        v-if="!vulnerabilites.length"
        class="mb-5 text-sm text-secondary-500"
      >
        Aucune CVE relevée. <span class="text-secondary-400">Cela ne veut pas dire « aucune vulnérabilité » : seul ce qui se voit de l'extérieur est relevé, et un service jamais relevé n'a rien non plus.</span>
      </p>
      <ul
        v-else
        class="mb-5 space-y-1.5"
      >
        <li
          v-for="v in vulnerabilites"
          :key="`${v.constat.id}-${v.cve}`"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-secondary-200/60 px-3 py-2"
        >
          <!-- L'IDENTIFIANT D'ABORD : c'est ce qu'on cherche des yeux, ce qu'on recopie dans un
               ticket, et ce qui se porte dans un bulletin. Le lien va au catalogue public. -->
          <a
            :href="`https://nvd.nist.gov/vuln/detail/${v.cve}`"
            target="_blank"
            rel="noopener noreferrer"
            class="font-mono text-sm font-semibold text-primary-700 hover:underline"
          >{{ v.cve }}</a>
          <Pill :tone="TON_GRAVITE[v.constat.gravite] ?? 'gray'">
            {{ LIBELLE_GRAVITE[v.constat.gravite] ?? v.constat.gravite }}
          </Pill>
          <span class="min-w-0 flex-1 text-sm text-secondary-700">{{ contexteCve(v.constat) }}</span>
          <span class="text-[11px] text-secondary-400">vu {{ v.constat.observations }} fois · dernier relevé le {{ fmt(v.constat.dernierReleveLe) }}</span>
        </li>
      </ul>

      <h2 class="mb-1 text-sm font-semibold text-secondary-900">
        Autres constats de l'audit de surface
      </h2>
      <p class="mb-3 text-xs text-secondary-500">
        Relevés depuis Internet par le moteur d'audit, et <strong>ouverts</strong> : ni acceptés, ni corrigés.
        Les décisions se prennent sur la page <NuxtLink
          to="/audit-surface"
          class="text-primary-700 hover:underline"
        >Audit de surface</NuxtLink>, où le motif et l'auteur sont conservés.
      </p>
      <p
        v-if="!autresConstats.length"
        class="text-sm text-secondary-500"
      >
        Aucun autre constat ouvert. <span class="text-secondary-400">Ce n'est pas « aucun défaut » : un service jamais relevé n'a pas de constat non plus.</span>
      </p>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="c in autresConstats"
          :key="c.id"
          class="rounded-xl border border-secondary-200/60 px-3 py-2"
        >
          <div class="flex flex-wrap items-center gap-2">
            <Pill :tone="TON_GRAVITE[c.gravite] ?? 'gray'">
              {{ LIBELLE_GRAVITE[c.gravite] ?? c.gravite }}
            </Pill>
            <span class="text-sm font-medium text-secondary-900">{{ c.titre }}</span>
          </div>
          <p class="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-secondary-500">
            <span>{{ CATEGORIE_CONSTAT[c.categorie] ?? c.categorie }}</span>
            <!-- LA RÉFÉRENCE PORTE LES CVE quand il y en a : c'est ce qu'on recopie dans un ticket. -->
            <span
              v-if="c.reference"
              class="font-mono text-secondary-600"
            >{{ c.reference }}</span>
            <span>vu {{ c.observations }} fois</span>
            <span class="text-secondary-400">dernier relevé le {{ fmt(c.dernierReleveLe) }}</span>
          </p>
        </li>
      </ul>
    </section>

    <!-- PAGES CIBLES ET INTÉGRITÉ DES SCRIPTS. -->
    <section
      v-if="pages"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm"
    >
      <h2 class="mb-1 text-sm font-semibold text-secondary-900">
        Pages cibles et intégrité des scripts
      </h2>
      <p class="mb-3 text-xs text-secondary-500">
        Les scripts servis sur les pages déclarées sont relevés par le moteur d'audit et comparés à une référence validée.
        Une page conforme vue de l'extérieur n'est pas pour autant saine : une porte dérobée placée dans un fichier du CMS, sous un nom légitime, ne se voit pas d'ici.
      </p>
      <div
        v-if="modifiable"
        class="mb-4 flex flex-wrap items-end gap-2"
      >
        <input
          v-model="nouvellePage.url"
          :placeholder="`https://${f.service.hote}/paiement`"
          class="min-w-72 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
        >
        <select
          v-model="nouvellePage.nature"
          class="rounded-lg border border-secondary-200 px-2 py-2 text-sm"
        >
          <option
            v-for="(l, k) in NATURE_PAGE"
            :key="k"
            :value="k"
          >
            {{ l }}
          </option>
        </select>
        <UIButton
          :disabled="busy || !nouvellePage.url.trim()"
          @click="ajouterPage"
        >
          Ajouter la page
        </UIButton>
      </div>
      <p
        v-if="msgPages"
        class="mb-2 text-sm text-secondary-700"
      >
        {{ msgPages }}
      </p>
      <p
        v-if="!pages.length"
        class="text-sm text-secondary-500"
      >
        Aucune page cible déclarée : l'intégrité des scripts n'est pas surveillée sur ce service.
      </p>
      <article
        v-for="p in pages"
        :key="p.id"
        class="space-y-2 border-t border-secondary-100 py-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Pill tone="blue">
            {{ NATURE_PAGE[p.nature] ?? p.nature }}
          </Pill>
          <span class="break-all font-mono text-xs text-secondary-800">{{ p.url }}</span>
        </div>
        <p class="text-xs text-secondary-500">
          {{ p.dernierReleveLe ? `Relevée le ${fmt(p.dernierReleveLe)}` : 'Jamais relevée par le moteur' }}
          · {{ p.referenceValideeLe ? `référence de ${p.referenceScripts} script(s) validée le ${fmt(p.referenceValideeLe)} par ${p.referenceValideePar}` : 'aucune référence validée : aucun écart ne peut être détecté' }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <Pill :tone="CSP[p.csp.etat]?.t">
            {{ CSP[p.csp.etat]?.l ?? p.csp.etat }}
          </Pill>
          <span
            v-for="r in p.csp.raisons"
            :key="r"
            class="text-xs text-amber-700"
          >{{ r }}</span>
          <span
            v-if="p.sri.externes"
            class="text-xs text-secondary-600"
          >SRI sur {{ p.sri.avecIntegrity }} des {{ p.sri.externes }} script(s) externe(s)</span>
        </div>
        <div
          v-if="p.ecarts.length"
          class="flex flex-wrap gap-1.5"
        >
          <Pill
            v-for="(e, i) in p.ecarts"
            :key="i"
            :tone="e.nature === 'nouveau_domaine_tiers' || e.nature === 'script_modifie' ? 'red' : 'amber'"
          >
            {{ LIBELLE_ECART[e.nature] ?? e.nature }} {{ e.nature === 'nouveau_domaine_tiers' ? e.domaine : (e.src ?? 'script en ligne') }}
          </Pill>
        </div>
        <div
          v-if="p.scripts.length"
          class="overflow-x-auto"
        >
          <table class="w-full text-xs">
            <thead>
              <tr class="text-left text-secondary-500">
                <th class="py-1 pr-3 font-medium">
                  Script
                </th>
                <th class="py-1 pr-3 font-medium">
                  Domaine
                </th>
                <th class="py-1 pr-3 font-medium">
                  SRI
                </th>
                <th class="py-1 pr-3 font-medium">
                  Empreinte
                </th>
                <th class="py-1 font-medium">
                  État
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(sc, i) in p.scripts"
                :key="i"
                class="border-t border-secondary-100"
              >
                <td
                  class="max-w-md truncate py-1 pr-3 font-mono"
                  :title="sc.src ?? ''"
                >
                  {{ sc.src ?? 'en ligne' }}
                </td>
                <td class="py-1 pr-3">
                  {{ sc.domaine ?? '—' }}<span
                    v-if="sc.externe"
                    class="ml-1 text-amber-700"
                  >tiers</span>
                </td>
                <td class="py-1 pr-3">
                  {{ sc.integrity ? 'oui' : '—' }}
                </td>
                <td class="py-1 pr-3 font-mono">
                  {{ sc.sha256.slice(0, 12) }}…
                </td>
                <td class="py-1">
                  <Pill :tone="ETAT_SCRIPT[sc.etat]?.t">
                    {{ ETAT_SCRIPT[sc.etat]?.l ?? sc.etat }}
                  </Pill>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="modifiable"
          class="flex flex-wrap gap-2"
        >
          <UIButton
            variant="secondary"
            :disabled="busy || !p.dernierReleveLe"
            @click="validerReference(p)"
          >
            {{ p.referenceValideeLe ? 'Revalider la référence' : 'Valider comme référence' }}
          </UIButton>
          <UIButton
            variant="secondary"
            :disabled="busy"
            @click="retirerPage(p)"
          >
            Retirer la page
          </UIButton>
        </div>
      </article>
    </section>

    <!-- ÉVOLUTION. Chaque relevé, avec ce qui a changé depuis le précédent. -->
    <section
      v-if="historique"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm"
    >
      <h2 class="mb-1 text-sm font-semibold text-secondary-900">
        Évolution
      </h2>
      <p class="mb-3 text-xs text-secondary-500">
        Technologies, en-têtes et certificat sont comparés au dernier relevé qui les a lus : une coupure réseau n'efface rien.
      </p>
      <p
        v-if="!historique.releves.length"
        class="text-sm text-secondary-500"
      >
        Aucun relevé consigné pour l'instant. L'historique commence au prochain relevé.
      </p>
      <ol
        v-else
        class="divide-y divide-secondary-100"
      >
        <li
          v-for="r in historique.releves"
          :key="r.id"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
        >
          <span class="w-36 shrink-0 tabular-nums text-secondary-500">{{ new Date(r.releveLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) }}</span>
          <span
            v-if="!r.changements.length"
            class="text-secondary-400"
          >{{ r.statut === 'ok' ? 'Aucun changement' : 'Injoignable' }}</span>
          <Pill
            v-for="(c, i) in r.changements"
            :key="i"
            :tone="decrireChangement(c).ton"
          >
            {{ decrireChangement(c).texte }}
          </Pill>
        </li>
      </ol>
      <p
        v-if="historique.plusAnciens"
        class="mt-2 text-xs text-secondary-500"
      >
        Seuls les 30 derniers relevés sont affichés.
      </p>
    </section>
  </div>
</template>
