// Engendre le SQL de l'import (exigences + SoA + correspondance) pour l'éprouver en base.
// Postgres n'est pas publié sur l'hôte : on passe par psql plutôt que par une connexion.
import { chargerReferentielNis2, objectifsDuReferentiel } from '../src/utils/referentielNis2'
import { chargerCorrespondanceIso, rapprocher, referenceSoa } from '../src/utils/correspondanceIso'
import { mesuresSoa } from '../src/utils/referentiels'

const q = (v: string | null | undefined) => v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
const out: string[] = []

const exigences = chargerReferentielNis2()
for (const o of objectifsDuReferentiel(exigences)) {
  out.push(`INSERT INTO objectif_nis2 (id, numero, intitule, domaine, applicabilite) VALUES ('o${o.numero}', ${o.numero}, ${q(o.intitule)}, 'gouvernance', ${q(o.applicabilite)}) ON CONFLICT (numero) DO NOTHING;`)
}
for (const [i, e] of exigences.entries()) {
  out.push(`INSERT INTO exigence_nis2 (id, reference, objectif_nis2_id, intitule, attendu_ei, attendu_ee) VALUES ('e${i}', ${q(e.reference)}, 'o${e.objectifNumero}', ${q(e.contenu.slice(0, 400))}, ${e.attenduEi}, ${e.attenduEe}) ON CONFLICT (reference) DO NOTHING;`)
}
for (const [i, m] of mesuresSoa.entries()) {
  out.push(`INSERT INTO mesure_smsi (id, reference, intitule) VALUES ('m${i}', ${q(m.reference)}, ${q(m.intitule)}) ON CONFLICT (reference) DO NOTHING;`)
}

// Rapprochement, exactement comme le routeur.
const parReference = new Map(exigences.map((e, i) => [e.reference, `e${i}`] as const))
const parRefSoa = new Map(mesuresSoa.map((m, i) => [m.reference, `m${i}`] as const))
let nRenvois = 0, nLiens = 0
const rapprochees: string[] = [], introuvables: string[] = []
for (const [ci, c] of chargerCorrespondanceIso().entries()) {
  const cible = rapprocher(c.reference, parReference)
  if (!cible) { introuvables.push(c.reference); continue }
  if (cible.viaNumero) rapprochees.push(c.reference)
  out.push(`UPDATE exigence_nis2 SET correspondance_iso = ${c.correspondance ? `'${c.correspondance}'` : 'NULL'}, observations_iso = ${q(c.observations)} WHERE id = '${cible.id}';`)
  for (const [ri, r] of c.renvois.entries()) {
    out.push(`INSERT INTO exigence_nis2_iso (id, exigence_nis2_id, norme, reference, intitule, ordre) VALUES ('i${ci}_${ri}', '${cible.id}', ${q(r.norme)}, ${q(r.reference)}, ${q(r.intitule)}, ${r.ordre}) ON CONFLICT DO NOTHING;`)
    nRenvois++
    const refSoa = referenceSoa(r)
    const mid = refSoa && parRefSoa.get(refSoa)
    if (mid) { out.push(`INSERT INTO exigence_nis2_mesure (id, exigence_nis2_id, mesure_smsi_id) VALUES ('l${ci}_${ri}', '${cible.id}', '${mid}') ON CONFLICT DO NOTHING;`); nLiens++ }
  }
}
console.error(`-- renvois ${nRenvois}, liens SoA ${nLiens}, rapprochées par numéro ${rapprochees.join(',') || '—'}, introuvables ${introuvables.join(',') || '—'}`)
console.log(out.join('\n'))
