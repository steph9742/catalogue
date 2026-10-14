// Contrôle de cohérence du référentiel RGPD avant seed : aucun lien orphelin, aucune
// référence ISO ou objectif ReCyF inventé.
import { readFileSync } from 'node:fs'
import { exigencesRgpd, liensRgpd, rgpdSansEquivalent } from '../src/utils/referentielRgpd'
import { mesuresSoa } from '../src/utils/referentiels'
import { chargerReferentielNis2, objectifsDuReferentiel } from '../src/utils/referentielNis2'

const refs = new Set(exigencesRgpd.map(e => e.reference))
const soa = new Set(mesuresSoa.map(m => m.reference))
const objectifs = new Set(objectifsDuReferentiel(chargerReferentielNis2()).map(o => String(o.numero)))
// Clauses 27001 citées : elles ne sont pas seedées (pas de mesures d'annexe A), on vérifie
// seulement qu'elles ont une forme de clause plausible.
const clause27001 = /^\d+(\.\d+)*$/

let ko = 0
const dire = (bon: boolean, msg: string) => { if (!bon) ko++; console.log(`${bon ? '✓' : '✗'} ${msg}`) }

dire(refs.size === exigencesRgpd.length, `${exigencesRgpd.length} exigences, références uniques`)
const orphelins = liensRgpd.filter(l => !refs.has(l.reference))
dire(orphelins.length === 0, `liens rattachés à une exigence existante (orphelins : ${orphelins.map(o => o.reference).join(',') || 'aucun'})`)

const isoKo = liensRgpd.filter(l => l.cible === 'iso27002' && !soa.has(l.cle))
dire(isoKo.length === 0, `références ISO 27002 présentes dans la SoA (introuvables : ${isoKo.map(l => l.cle).join(',') || 'aucune'})`)

const nis2Ko = liensRgpd.filter(l => l.cible === 'nis2' && !objectifs.has(l.cle))
dire(nis2Ko.length === 0, `objectifs ReCyF existants (introuvables : ${nis2Ko.map(l => l.cle).join(',') || 'aucun'})`)

const c1Ko = liensRgpd.filter(l => l.cible === 'iso27001' && !clause27001.test(l.cle))
dire(c1Ko.length === 0, `clauses 27001 bien formées (douteuses : ${c1Ko.map(l => l.cle).join(',') || 'aucune'})`)

const sansJustif = liensRgpd.filter(l => !l.justification?.trim())
dire(sansJustif.length === 0, `chaque lien porte une justification (sans : ${sansJustif.length})`)

// Une exigence sans lien doit être DÉCLARÉE sans équivalent, avec sa raison. C'est la
// différence entre un constat et un oubli.
const sansLien = exigencesRgpd.filter(e => !liensRgpd.some(l => l.reference === e.reference))
const nonDeclarees = sansLien.filter(e => !rgpdSansEquivalent[e.reference]?.trim())
dire(nonDeclarees.length === 0, `toute exigence sans lien est déclarée sans équivalent (non déclarées : ${nonDeclarees.map(e => e.reference).join(',') || 'aucune'})`)
const declareesEnTrop = Object.keys(rgpdSansEquivalent).filter(r => liensRgpd.some(l => l.reference === r))
dire(declareesEnTrop.length === 0, `aucune exigence déclarée sans équivalent n'a pourtant un lien (${declareesEnTrop.join(',') || 'aucune'})`)
console.log(`  → ${sansLien.length} exigence(s) sans équivalent, assumée(s) : ${sansLien.map(e => e.reference).join(', ') || 'aucune'}`)

// LE CONTRÔLE QUI MANQUAIT : les champs du référentiel sont-ils réellement ÉCRITS ?
const routeur = readFileSync(new URL('../src/routers/referentiels.ts', import.meta.url), 'utf8')
const bloc = routeur.slice(routeur.indexOf("params.cle === 'rgpd'"), routeur.indexOf('const parRef'))
const champsAttendus = ['article', 'intituleArticle', 'intitule', 'portee', 'ordre'] as const
const oublies = champsAttendus.filter(c => !bloc.includes(`${c}:`))
dire(oublies.length === 0, `l'import écrit tous les champs de la source (oubliés : ${oublies.join(', ') || 'aucun'})`)

// LES CORRÉLATIONS DU SELECT SONT-ELLES QUALIFIÉES ? Quand un fragment sql`` est un champ de
// premier niveau du select, drizzle rend `${application.id}` en « "id" » NU — qui, dans un
// sous-select corrélé, se résout sur la table du sous-select : la corrélation devient
// `r.application_id = r.id`, toujours…
const { db } = await import('@catalogue/database')
const { application } = await import('@catalogue/database/tables')
const { selectionEtatRgpd } = await import('../src/routers/rgpd')
const sqlGenere = db.select({ ...selectionEtatRgpd() }).from(application).toSQL().sql
const correlationsNues = [...sqlGenere.matchAll(/application_id = "id"/g)].length
dire(correlationsNues === 0, `les sous-selects corrélés qualifient leur colonne (« application_id = "id" » nu : ${correlationsNues})`)
dire(sqlGenere.includes('"application"."id"'), 'le SQL généré porte au moins une corrélation pleinement qualifiée')

console.log(`\n${liensRgpd.length} liens proposés sur ${exigencesRgpd.length} exigences.`)
console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
