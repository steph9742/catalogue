// ENTITÉS EDR — placer les agents hors GLPI sans deviner, et sans ouvrir de doublon de ligne.
import { cleEntiteEdr, libelleCible, proposerRattachement, rattachementEffectif, resoudreUnite, type CibleEdr } from '../src/utils/entitesEdr'
import { ENTITE_EDR_NON_RATTACHEE, SANS_ENTITE_EDR, ventilerCouverture } from '../src/utils/couvertureParUnite'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const REFS = {
  entites: [{ id: 'e1', nom: 'l\'établissement' }],
  composantes: [
    { id: 'c-iut', nom: 'IUT NFC', entiteId: 'e1', sigle: null },
    { id: 'c-stgi', nom: 'UFR STGI', entiteId: 'e1', sigle: null },
    { id: 'c-femto', nom: 'FEMTO-ST', entiteId: 'e1', sigle: null },
    { id: 'c-dsin', nom: 'Dnum', entiteId: 'e1', sigle: null },
    { id: 'c-st', nom: 'UFR ST', entiteId: 'e1', sigle: null },
  ],
  services: [
    { id: 's-cri', nom: 'CRI', composanteId: 'c-iut' },
    { id: 's-prox', nom: 'Proximité', composanteId: 'c-dsin' },
    { id: 's-scd1', nom: 'SCD', composanteId: 'c-iut' },
    { id: 's-scd2', nom: 'SCD', composanteId: 'c-st' },
  ],
  departements: [{ id: 'd-info', nom: 'Dept-INFO', composanteId: 'c-st' }],
  poles: [{ id: 'p-reseau', nom: 'Réseau', serviceId: 's-cri' }],
}
const prop = (v: string | null) => proposerRattachement(v, REFS)
const cle = (c: CibleEdr | null) => (c ? `${c.type}:${c.id}` : null)

console.log('\nLe rapprochement automatique : exact, unique, ou rien')
dire(cle(prop('IUTNFC').cible) === 'composante:c-iut', '« IUTNFC » → IUT NFC')
dire(cle(prop('UFRSTGI').cible) === 'composante:c-stgi' && cle(prop('UFR_STGI').cible) === 'composante:c-stgi', '« UFRSTGI » et « UFR_STGI » → la même composante')
dire(cle(prop('FEMTOST').cible) === 'composante:c-femto', '« FEMTOST » → FEMTO-ST')
dire(cle(prop('DnumProximite').cible) === 'service:s-prox', '« DnumProximite » → service Proximité de la Dnum (composante + service)')
dire(cle(prop('CRIReseau').cible) === 'pole:p-reseau', 'service + pôle → le pôle')
dire(prop('SCD').motif === 'ambigu' && prop('SCD').cible === null, '« SCD » présent dans deux composantes : ambigu, rangé nulle part')
dire(prop('utinam_end').motif === 'aucun', '« utinam_end » : aucune correspondance, à déclarer')
dire(prop('Cyber').cible === null, '« Cyber » ne rejoint pas la direction du numérique')
dire(prop('').motif === 'vide' && prop(null).motif === 'vide', 'une entité vide n\'est rapprochée de rien')
dire(prop('Reseau').cible === null, 'un nom de pôle seul ne suffit pas')

console.log('\nLa déclaration l\'emporte ; une déclaration orpheline se signale')
{
  const decl = new Map<string, CibleEdr>([['STDeptEnsInfo', { type: 'departement', id: 'd-info' }], ['IUTNFC', { type: 'service', id: 's-cri' }], ['ancien', { type: 'service', id: 'supprime' }]].map(([v, c]) => [cleEntiteEdr(v as string), c as CibleEdr]))
  dire(cle(rattachementEffectif('STDeptEnsInfo', decl, REFS).cible) === 'departement:d-info', '« STDeptEnsInfo » déclaré → département informatique')
  const iut = rattachementEffectif('IUTNFC', decl, REFS)
  dire(iut.source === 'declaree' && cle(iut.cible) === 'service:s-cri', 'une déclaration remplace la proposition automatique')
  const orphelin = rattachementEffectif('ancien', decl, REFS)
  dire(orphelin.motif === 'cible_disparue' && orphelin.cible === null, 'unité supprimée : « cible disparue », pas de repli silencieux sur l\'automatique')
  dire(rattachementEffectif('FEMTOST', decl, REFS).source === 'automatique', 'sans déclaration, l\'automatique s\'applique')
}

console.log('\nLes parents se déduisent des référentiels')
{
  const u = resoudreUnite({ type: 'pole', id: 'p-reseau' }, REFS)
  dire(u?.composanteId === 'c-iut' && u.sousUnite?.id === 's-cri' && u.poleId === 'p-reseau', 'un pôle donne son service et sa composante')
  dire(libelleCible({ type: 'pole', id: 'p-reseau' }, REFS) === 'IUT NFC › CRI › Réseau', 'libellé complet, lisible sans ambiguïté')
  dire(resoudreUnite({ type: 'service', id: 'nulle-part' }, REFS) === null, 'une unité inconnue ne se résout pas')
}

console.log('\nLA VENTILATION : les agents rejoignent les lignes des machines, et rien ne se perd')
{
  const agents = [
    { entiteEdr: 'CRIReseau', unite: resoudreUnite({ type: 'pole', id: 'p-reseau' }, REFS) },
    { entiteEdr: 'IUTNFC', unite: resoudreUnite({ type: 'composante', id: 'c-iut' }, REFS) },
    { entiteEdr: 'utinam_end', unite: null },
    { entiteEdr: null, unite: null },
  ]
  const { composantes, sousUnites, poles } = ventilerCouverture(
    [{ glpiId: 'm1', entite: 'l\'établissement > IUT NFC > CRI > Réseau' }], new Set(['m1']), new Set(), REFS, undefined, agents,
  )
  for (const [nom, l] of [['composantes', composantes], ['sous-unités', sousUnites], ['pôles', poles]] as const) {
    dire(l.reduce((n, x) => n + x.agentsHorsGlpi, 0) === agents.length, `${nom} : les ${agents.length} agents hors GLPI sont tous comptés`)
  }
  dire(composantes.filter(x => x.composanteId === 'c-iut').length === 1, 'un seul « IUT NFC » : agents et machines partagent la ligne')
  const cri = sousUnites.filter(x => x.id === 's-cri')
  dire(cri.length === 1 && cri[0]!.critiques === 1 && cri[0]!.agentsHorsGlpi === 1, 'le service CRI porte sa machine critique ET l\'agent hors GLPI')
  dire(poles.find(x => x.id === 'p-reseau')?.agentsHorsGlpi === 1, 'le pôle Réseau porte son agent')
  dire(composantes.find(x => x.nom === ENTITE_EDR_NON_RATTACHEE)?.agentsHorsGlpi === 1, 'l\'entité non rattachée a sa ligne nommée')
  dire(composantes.find(x => x.nom === SANS_ENTITE_EDR)?.agentsHorsGlpi === 1, 'l\'agent sans entité aussi')
  dire(composantes.every(x => x.critiques + x.nonCritiques >= 0) && composantes.find(x => x.nom === ENTITE_EDR_NON_RATTACHEE)!.critiques === 0,
    'les agents ne gonflent pas le compte des machines')
}

console.log('\nUNE DÉCLARATION PEUT PRÉCÉDER L\'ÉTIQUETTE')
{
  const decl = new Map<string, CibleEdr>([[cleEntiteEdr('DnumDev'), { type: 'service', id: 's-prox' }]])
  dire(cle(rattachementEffectif('DNUM_DEV', decl, REFS).cible) === 'service:s-prox', 'déclarée « DnumDev », l\'étiquette « DNUM_DEV » la retrouve')
  dire(cle(rattachementEffectif('dnumdev', decl, REFS).cible) === 'service:s-prox', 'la casse n\'y change rien')
}

console.log('\nL\'ÉTABLISSEMENT SANS COMPOSANTE : les agents rejoignent les machines laissées à la racine')
{
  const decl = new Map<string, CibleEdr>([[cleEntiteEdr('DnumProximite'), { type: 'etablissement', id: 'e1' }]])
  const e = rattachementEffectif('DnumProximite', decl, REFS)
  dire(e.source === 'declaree' && e.cible?.type === 'etablissement', 'la déclaration l\'emporte sur le rapprochement avec le service Proximité de la Dnum')
  dire(libelleCible({ type: 'etablissement', id: 'e1' }, REFS) === 'l\'établissement — sans composante', 'libellé explicite')
  dire(proposerRattachement('l\'établissement', REFS).cible?.type !== 'etablissement', 'jamais proposé automatiquement')
  const { composantes } = ventilerCouverture(
    [{ glpiId: 'm-racine', entite: 'l\'établissement' }], new Set(), new Set(), REFS, undefined,
    [{ entiteEdr: 'DnumProximite', unite: resoudreUnite(e.cible!, REFS) }],
  )
  const racine = composantes.filter(x => x.composanteId === null && x.nom === '(sans composante dans GLPI)')
  dire(racine.length === 1 && racine[0]!.critiques === 1 && racine[0]!.agentsHorsGlpi === 1, 'la machine racine et l\'agent partagent la même ligne')
  dire(resoudreUnite({ type: 'etablissement', id: 'inconnu' }, REFS) === null, 'un établissement inconnu ne se résout pas')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
