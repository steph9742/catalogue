import { auth } from '@catalogue/auth'
import { db } from '@catalogue/database'
import { user, population, sectionCnu, mesureSmsi, objectifNis2, exigenceNis2, entiteNis2 } from '@catalogue/database/tables'
import { chargerReferentielNis2, objectifsDuReferentiel } from './utils/referentielNis2'
// Les jeux de données de référence vivent dans un module partagé : le démarrage et le
// bouton « Importer » de l'administration chargent EXACTEMENT la même chose.
import { mesuresSoa, populations, sectionsCnu } from './utils/referentiels'
import { eq, sql } from 'drizzle-orm'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// COMPTE ADMINISTRATEUR DE SECOURS. C'est le compte qui permet de reprendre la main quand le
// SSO est indisponible — panne de l'annuaire, client OIDC mal déclaré, claim `groups` absent.
const email = process.env.SEED_ADMIN_EMAIL || 'secours@catalogue.local'
const name = process.env.SEED_ADMIN_NAME || 'Administrateur de secours'

/** Mot de passe robuste, lisible à la voix et sans caractère ambigu (0/O, 1/l/I). */
function engendrerMotDePasse(longueur = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-+=?!@#'
  const octets = crypto.getRandomValues(new Uint8Array(longueur))
  return Array.from(octets, o => alphabet[o % alphabet.length]).join('')
}

// D'OÙ VIENT LE MOT DE PASSE, par ordre de priorité. Le FICHIER passe avant la variable
// d'environnement, et ce n'est pas un détail : une variable se lit dans `docker inspect`, dans
// la liste des processus et dans les journaux de l'orchestrateur.
const CHEMIN_SECRET_DEFAUT = '.secrets/admin-password'

function lireFichier(chemin: string): string | null {
  try {
    const contenu = readFileSync(chemin, 'utf8').trim()
    return contenu || null
  }
  catch { return null }
}

let origineMotDePasse: 'fichier' | 'variable' | 'engendré'
let password: string | null = null

// 1. Fichier explicitement désigné (convention des secrets Docker).
const cheminDesigne = process.env.SEED_ADMIN_PASSWORD_FILE
if (cheminDesigne) {
  password = lireFichier(cheminDesigne)
  if (!password) {
    console.error(`❌ SEED_ADMIN_PASSWORD_FILE désigne « ${cheminDesigne} », mais ce fichier est introuvable ou vide.`)
    process.exit(1)
  }
  origineMotDePasse = 'fichier'
}
// 2. Variable d'environnement (installations automatisées).
else if (process.env.SEED_ADMIN_PASSWORD) {
  password = process.env.SEED_ADMIN_PASSWORD
  origineMotDePasse = 'variable'
}
// 3. Fichier de secret local, s'il existe déjà : le seed est rejoué à chaque déploiement,
//    et le mot de passe doit rester le même d'une fois sur l'autre.
else if ((password = lireFichier(CHEMIN_SECRET_DEFAUT))) {
  origineMotDePasse = 'fichier'
}
// 4. Rien de fourni : on en engendre un et on le DÉPOSE dans le fichier de secret, pour
//    qu'il survive au prochain seed et puisse être recopié vers le réplica.
else {
  password = engendrerMotDePasse()
  origineMotDePasse = 'engendré'
  try {
    mkdirSync(dirname(CHEMIN_SECRET_DEFAUT), { recursive: true })
    writeFileSync(CHEMIN_SECRET_DEFAUT, password + '\n', { mode: 0o600 })
  }
  catch (e) {
    // ÉCHEC D'ÉCRITURE DU SECRET : le mot de passe n'existe alors QUE dans cette sortie.
    const motif = e instanceof Error ? e.message : String(e)
    console.error('')
    console.error(`   ${'!'.repeat(64)}`)
    console.error(`   IMPOSSIBLE D'ENREGISTRER LE MOT DE PASSE DE SECOURS`)
    console.error('')
    console.error(`   Fichier visé : ${CHEMIN_SECRET_DEFAUT}`)
    console.error(`   Motif        : ${motif}`)
    console.error('')
    console.error('   Le mot de passe ci-dessous n\'existe QUE dans cette sortie.')
    console.error('   NOTEZ-LE MAINTENANT, puis réparez et rejouez le seed :')
    console.error('')
    console.error('     mkdir -p .secrets && sudo chown 1001:1001 .secrets && chmod 700 .secrets')
    console.error('     docker compose --profile seed run --rm seed')
    console.error('')
    console.error('   (le conteneur tourne en uid 1001 ; un dossier créé par Docker')
    console.error('    au montage appartient à root, et lui est donc fermé)')
    console.error(`   ${'!'.repeat(64)}`)
    console.error('')
  }
}

const motDePasseFourni = origineMotDePasse !== 'engendré'

async function promote(id: string) {
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, id))
}

/** Encadré bien visible : ce mot de passe ne sera plus jamais affiché. */
function afficherIdentifiants() {
  const l = (t: string) => console.log(`   ║ ${t.padEnd(62)} ║`)
  console.log(`   ╔${'═'.repeat(64)}╗`)
  l('')
  l('  COMPTE ADMINISTRATEUR DE SECOURS')
  l('')
  l(`  Adresse       : ${email}`)
  l(`  Mot de passe  : ${password}`)
  l('')
  l('  Connexion par /login-secours si le SSO est indisponible.')
  l('')
  console.log(`   ╚${'═'.repeat(64)}╝`)
  if (motDePasseFourni) {
    console.log(`   (source : ${origineMotDePasse})`)
  }
  else {
    console.log(`   Engendré aléatoirement et déposé dans « ${CHEMIN_SECRET_DEFAUT} » (droits 0600).`)
    console.log('   Copiez CE FICHIER vers le réplica pour partager le même identifiant,')
    console.log('   et rangez le mot de passe dans le coffre de l\'équipe.')
  }
}

try {
  const res = await auth.api.signUpEmail({ body: { email, password, name } })
  await promote(res.user.id)
  console.log('✅ Compte administrateur de secours créé.')
  afficherIdentifiants()
}
catch (erreur) {
  // Déjà existant : on s'assure simplement qu'il est admin.
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing[0]) {
    await promote(existing[0].id)
    // On NE réinitialise PAS le mot de passe d'un compte existant : le seed est rejoué à chaque
    // déploiement, et le remplacer à chaque fois invaliderait celui que la personne a noté —
    // sans compter la fenêtre où il transiterait dans les journaux.
    if (process.env.SEED_ADMIN_RESET === 'oui') {
      // On passe par le CONTEXTE interne, pas par `auth.api.setUserPassword` : cette route
      // appartient au greffon d'administration et exige une session admin authentifiée — un
      // script n'en a pas, et reçoit un 401.
      const ctx = await auth.$context
      const hache = await ctx.password.hash(password)
      await ctx.internalAdapter.updatePassword(existing[0].id, hache)
      console.log(`🔑 Compte ${email} — mot de passe RÉINITIALISÉ à la demande (SEED_ADMIN_RESET=oui).`)
      afficherIdentifiants()
    }
    else {
      console.log(`ℹ️  Compte ${email} déjà existant — rôle admin confirmé, mot de passe inchangé.`)
      console.log('   Mot de passe perdu ? Relancez avec SEED_ADMIN_RESET=oui après avoir')
      console.log(`   déposé le nouveau dans « ${CHEMIN_SECRET_DEFAUT} ».`)
    }
  }
  else {
    // Le compte n'existe pas ET n'a pas pu être créé : sans le motif exact, la personne
    // qui déploie n'a aucune prise sur le problème. On le montre.
    console.error('❌ Échec de création du compte administrateur de secours.')
    console.error(`   Adresse visée : ${email || '(vide)'}`)
    console.error(`   Motif         : ${erreur instanceof Error ? erreur.message : String(erreur)}`)
    if (erreur && typeof erreur === 'object' && 'body' in erreur) {
      console.error(`   Détail        : ${JSON.stringify((erreur as { body?: unknown }).body)}`)
    }
    if (process.env.AUTH_DOMAIN) {
      console.error(`   ℹ️  AUTH_DOMAIN vaut « ${process.env.AUTH_DOMAIN} » : si l'adresse doit appartenir`)
      console.error(`      à ce domaine, relancez avec SEED_ADMIN_EMAIL=secours@${process.env.AUTH_DOMAIN}`)
    }
    if ((process.env.BETTER_AUTH_SECRET ?? '') === 'change-me') {
      console.error("   ℹ️  BETTER_AUTH_SECRET vaut encore « change-me » : définissez-le dans .env.")
    }
    process.exit(1)
  }
}

await db
  .insert(population)
  .values(populations.map(nom => ({ nom })))
  .onConflictDoNothing()
console.log(`✅ Populations seedées (${populations.length})`)

await db
  .insert(sectionCnu)
  .values(sectionsCnu.map(([numero, intitule, groupe]) => ({ numero, intitule, groupe })))
  .onConflictDoUpdate({
    target: sectionCnu.numero,
    set: { intitule: sql`excluded.intitule`, groupe: sql`excluded.groupe` },
  })
console.log(`✅ Sections CNU seedées / mises à jour (${sectionsCnu.length})`)

await db
  .insert(mesureSmsi)
  .values(mesuresSoa)
  .onConflictDoUpdate({
    target: mesureSmsi.reference,
    set: {
      intitule: sql`excluded.intitule`,
      theme: sql`excluded.theme`,
      objectif: sql`excluded.objectif`,
      typeMesure: sql`excluded.type_mesure`,
      conceptsCyber: sql`excluded.concepts_cyber`,
    },
  })
console.log(`✅ Mesures SoA (Annexe A) seedées / mises à jour (${mesuresSoa.length})`)

// --- Référentiel NIS 2 : ReCyF (Référentiel Cyber France, ANSSI) --------------------
// Chargé depuis le CSV OFFICIEL versionné dans le dépôt, et non recopié à la main.
const DOMAINE_PAR_OBJECTIF: Record<number, 'gouvernance' | 'protection' | 'defense' | 'resilience'> = {
  1: 'gouvernance',
  2: 'gouvernance',
  3: 'gouvernance',
  4: 'gouvernance',
  5: 'gouvernance',
  6: 'protection',
  7: 'protection',
  8: 'protection',
  9: 'protection',
  10: 'protection',
  11: 'protection',
  12: 'defense',
  13: 'resilience',
  14: 'resilience',
  15: 'resilience',
  16: 'gouvernance',
  17: 'gouvernance',
  18: 'protection',
  19: 'protection',
  20: 'defense',
}

const exigencesReCyF = chargerReferentielNis2()
const objectifsReCyF = objectifsDuReferentiel(exigencesReCyF)

await db.insert(objectifNis2)
  .values(objectifsReCyF.map(o => ({
    numero: o.numero,
    intitule: o.intitule,
    domaine: DOMAINE_PAR_OBJECTIF[o.numero] ?? 'gouvernance',
    applicabilite: o.applicabilite,
  })))
  .onConflictDoUpdate({
    target: objectifNis2.numero,
    set: { intitule: sql`excluded.intitule`, domaine: sql`excluded.domaine`, applicabilite: sql`excluded.applicabilite` },
  })
const objIds = new Map((await db.select({ id: objectifNis2.id, numero: objectifNis2.numero }).from(objectifNis2)).map(o => [o.numero, o.id]))

await db.insert(exigenceNis2)
  .values(exigencesReCyF.map(e => ({
    reference: e.reference,
    objectifNis2Id: objIds.get(e.objectifNumero) ?? null,
    sousSection: e.thematique,
    // TEXTE OFFICIEL INTÉGRAL, sans reformulation.
    intitule: e.contenu,
    attenduEi: e.attenduEi,
    attenduEe: e.attenduEe,
    // Trace les contradictions de la source (ex. 13.5) au lieu de les masquer.
    notes: e.anomalieSource,
  })))
  .onConflictDoUpdate({
    target: exigenceNis2.reference,
    set: {
      intitule: sql`excluded.intitule`,
      sousSection: sql`excluded.sous_section`,
      attenduEi: sql`excluded.attendu_ei`,
      attenduEe: sql`excluded.attendu_ee`,
      objectifNis2Id: sql`excluded.objectif_nis2_id`,
      notes: sql`excluded.notes`,
    },
  })

console.log(`✅ Référentiel NIS 2 / ReCyF chargé depuis le CSV officiel (${objectifsReCyF.length} objectifs, ${exigencesReCyF.length} exigences)`)

// Entité NIS 2 : une ligne singleton pré-remplie pour l'université (à affiner ensuite
// dans l'interface). L'université est très probablement une entité essentielle.
await db.insert(entiteNis2)
  .values({ id: 'entite-nis2-singleton', statut: 'a_determiner', secteur: 'enseignement_superieur' })
  .onConflictDoNothing()
console.log('✅ Entité NIS 2 initialisée (statut à déterminer)')

process.exit(0)
