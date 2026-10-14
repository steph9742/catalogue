// INTÉGRITÉ DES SCRIPTS — dire l'écart, ne pas en inventer, ne rien valider d'office.
import { comparerScripts, constatDEcart, domaineRacine, etatDuScript, evaluerCsp, lirePage, type ScriptRef } from '../src/utils/integriteScripts'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const sha = (c: string) => c.repeat(64).slice(0, 64)
const MAINTENANT = new Date('2026-09-15T00:00:00Z')
const page = (scripts: unknown[], x: Record<string, unknown> = {}) => ({
  url: 'https://pufc.example.org/paiement#etape2', releve_le: '2026-09-14T02:00:00Z', csp: null, scripts, ...x,
})

console.log('\nUne page relevée est lue, normalisée')
{
  const l = lirePage(page([
    { src: '/js/jquery.colorbox-min.js?v=1.6.4', sha256: sha('A'), integrity: false },
    { src: 'https://static.example.org/commun.js', sha256: sha('b') },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', sha256: sha('c'), integrity: true },
    { src: null, sha256: sha('d') },
  ]), MAINTENANT)
  dire(l.ok, 'la page conforme est acceptée')
  if (l.ok) {
    dire(l.page.url === 'https://pufc.example.org/paiement', 'l\'ancre est retirée de l\'URL — sinon la page ne se rapproche pas de sa déclaration')
    dire(l.page.scripts[0]!.src === 'https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.4', 'un src relatif est résolu contre la page')
    dire(l.page.scripts[0]!.sha256 === sha('a'), 'l\'empreinte est ramenée en minuscules')
    dire(!l.page.scripts[1]!.externe, 'un sous-domaine de l\'établissement n\'est pas un tiers')
    dire(l.page.scripts[2]!.externe && l.page.scripts[2]!.integrity, 'cdnjs est un tiers, avec SRI')
    dire(l.page.scripts[3]!.src === null && !l.page.scripts[3]!.externe, 'un script en ligne n\'a ni src ni origine')
  }
}

console.log('\nUNE PAGE PARTIELLE EST REFUSÉE ENTIÈRE — un script manquant se lirait « retiré »')
dire(!lirePage(page([{ src: '/a.js', sha256: 'pas-une-empreinte' }]), MAINTENANT).ok, 'une empreinte illisible refuse la page')
dire(!lirePage(page(Array.from({ length: 501 }, () => ({ src: null, sha256: sha('e') }))), MAINTENANT).ok, 'plus de 500 scripts refuse la page')
dire(!lirePage(page([], { scripts: undefined }), MAINTENANT).ok, 'une page sans liste de scripts est refusée — ce n\'est pas « aucun script »')
dire(!lirePage(page([], { releve_le: '2027-01-01T00:00:00Z' }), MAINTENANT).ok, 'un relevé daté dans le futur est refusé')
dire(!lirePage(page([], { url: 'javascript:alert(1)' }), MAINTENANT).ok, 'une URL non http est refusée')

const s = (src: string | null, c: string, externe = false): ScriptRef => ({
  src, sha256: sha(c), externe, domaine: src ? new URL(src).hostname : null,
})
const REF = [
  s('https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.4', 'a'),
  s('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', 'c', true),
  s(null, 'd'),
]

console.log('\nRien n\'a changé, rien n\'est dit')
dire(comparerScripts(REF, REF).length === 0, 'la référence comparée à elle-même ne rend aucun écart')
dire(comparerScripts(REF, [
  s('https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.5', 'a'), REF[1]!, REF[2]!,
]).length === 0, 'un paramètre de cache qui change sans que le contenu change n\'est pas un écart')

console.log('\nLE CAS un site de l\'établissement : le script de la page de paiement est modifié')
{
  const e = comparerScripts(REF, [s('https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.4', 'f'), REF[1]!, REF[2]!])
  dire(e.length === 1 && e[0]!.nature === 'script_modifie', 'un seul écart : le script modifié, pas un retrait et un ajout')
  dire(e[0]!.avant === sha('a') && e[0]!.apres === sha('f'), 'avec l\'empreinte de référence et l\'empreinte servie')
}

console.log('\nUN NOUVEAU DOMAINE TIERS est dit en plus de l\'ajout')
{
  const e = comparerScripts(REF, [...REF, s('https://jquery-cdn-stats.top/s.js', '9', true)])
  dire(e.some(x => x.nature === 'script_ajoute'), 'le script ajouté est dit')
  dire(e.some(x => x.nature === 'nouveau_domaine_tiers' && x.domaine === 'jquery-cdn-stats.top'), 'et le nouveau domaine tiers, à part')
  const connu = comparerScripts(REF, [...REF, s('https://cdnjs.cloudflare.com/ajax/libs/lodash/4.17.21/lodash.min.js', '8', true)])
  dire(!connu.some(x => x.nature === 'nouveau_domaine_tiers'), 'un nouveau script d\'un domaine déjà référencé n\'est pas un nouveau tiers')
}

console.log('\nRetraits, et scripts en ligne')
{
  const e = comparerScripts(REF, [REF[0]!, REF[2]!])
  dire(e.length === 1 && e[0]!.nature === 'script_retire' && !!e[0]!.src?.includes('jquery.min.js'), 'le script retiré est dit')
  const enLigne = comparerScripts(REF, [REF[0]!, REF[1]!, s(null, '7')])
  dire(enLigne.some(x => x.nature === 'script_ajoute' && x.src === null) && enLigne.some(x => x.nature === 'script_retire' && x.src === null),
    'un script en ligne modifié se lit comme un retrait et un ajout — il n\'a pas d\'identité hors de son empreinte')
}

console.log('\nL\'état de chaque script, pour la fiche')
dire(etatDuScript(REF[0]!, REF, false) === 'sans_reference', 'sans référence validée, aucun script n\'est « conforme »')
dire(etatDuScript(REF[0]!, REF, true) === 'conforme', 'identique à la référence : conforme')
dire(etatDuScript(s('https://pufc.example.org/js/jquery.colorbox-min.js', 'f'), REF, true) === 'modifie', 'même chemin, autre empreinte : modifié')
dire(etatDuScript(s('https://pufc.example.org/js/autre.js', 'f'), REF, true) === 'nouveau', 'chemin inconnu : nouveau')

console.log('\nLE CONSTAT D\'UN ÉCART : stable d\'une nuit à l\'autre, distinct d\'une nouvelle modification')
{
  const p = { id: 'p1', url: 'https://pufc.example.org/paiement' }
  const e1 = comparerScripts(REF, [s('https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.4', 'f'), REF[1]!, REF[2]!])[0]!
  const e1bis = comparerScripts(REF, [s('https://pufc.example.org/js/jquery.colorbox-min.js?v=9', 'f'), REF[1]!, REF[2]!])[0]!
  const e2 = comparerScripts(REF, [s('https://pufc.example.org/js/jquery.colorbox-min.js?v=1.6.4', 'e'), REF[1]!, REF[2]!])[0]!
  dire(constatDEcart(p, e1).cleStable === constatDEcart(p, e1bis).cleStable, 'le même écart relevé deux nuits de suite garde sa clé')
  dire(constatDEcart(p, e1).cleStable !== constatDEcart(p, e2).cleStable, 'une nouvelle modification du même script ouvre un autre constat')
  dire(constatDEcart({ ...p, id: 'p2' }, e1).cleStable !== constatDEcart(p, e1).cleStable, 'le même écart sur une autre page est un autre constat')
  dire(constatDEcart(p, e1).gravite === 'elevee' && constatDEcart(p, { nature: 'nouveau_domaine_tiers', src: 'https://x.top/s.js', domaine: 'x.top', avant: null, apres: sha('1') }).gravite === 'critique',
    'modifié : élevée ; nouveau domaine tiers : critique')
  dire(constatDEcart(p, e1).cleStable.length <= 200, 'la clé tient dans la borne des clés du moteur')
}

console.log('\nLA CSP EFFECTIVE, pas seulement présente')
dire(evaluerCsp(null).etat === 'non_relevee', 'jamais relevée : non relevée — pas « absente »')
dire(evaluerCsp('').etat === 'absente', 'relevée sans en-tête : absente')
dire(evaluerCsp('frame-ancestors \'self\'').etat === 'inoperante', 'frame-ancestors seul : présente, et sans effet sur les scripts')
dire(evaluerCsp('default-src \'self\'; img-src *').etat === 'effective', 'default-src \'self\' restreint les scripts, img-src * n\'y change rien')
dire(evaluerCsp('script-src \'self\' \'unsafe-inline\'').etat === 'faible', '\'unsafe-inline\' sans nonce : faible')
dire(evaluerCsp('script-src \'nonce-r4nd0m\' \'unsafe-inline\' \'strict-dynamic\'').etat === 'effective', '\'unsafe-inline\' neutralisé par un nonce : effective')
dire(evaluerCsp('script-src https:').raisons.some(r => r.includes('https:')), 'script-src https: autorise toute origine, et le dit')
dire(evaluerCsp('script-src \'self\'; script-src *').etat === 'effective', 'une directive répétée : la première l\'emporte, comme dans le navigateur')

console.log('\nLe domaine racine')
dire(domaineRacine('Static.Example.org') === 'example.org', 'sous-domaine ramené à la racine, en minuscules')
dire(domaineRacine('193.52.1.10') === '193.52.1.10', 'une adresse IP reste entière')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
