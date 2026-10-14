import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { correspondanceUnite, connecteurLdap, uniteVue } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { chiffrer } from '../utils/secrets'
import { testerLdap } from '../utils/ldapClient'
import { configLdapComplete, couvertureMfa, fileARapprocher, lireConfigLdap, synchroniserLdap, valeursGlpi, SINGLETON_LDAP } from '../utils/ldapSync'

// CONNECTEUR LDAPS — configuration, correspondances, synchronisation. LECTURE SEULE côté
// annuaire.

/** Le mot de passe ne sort jamais, même chiffré. Seul son existence est publiée. */
function masquer(c: Awaited<ReturnType<typeof lireConfigLdap>>) {
  if (!c) return null
  const { motDePasse, ...reste } = c
  return { ...reste, motDePasseDefini: !!motDePasse }
}

/** La configuration utilisable, ou `null` si elle est incomplète. */

/**
 * Traduit une erreur d'écriture en phrase actionnable. Une contrainte violée porte le nom de
 * son index, pas celui du champ : « violates unique constraint
 * "correspondance_unite_glpi_unique" » n'aide personne à corriger sa saisie.
 */
/**
 * Une chaîne VIDE n'est pas une valeur. Un `<select>` non renseigné envoie `""`, que PostgreSQL
 * refuse sur une colonne d'énumération — « invalid input value for enum » — et qui, sur une
 * colonne texte, créerait un code vide occupant la contrainte d'unicité.
 */
function vider<T extends Record<string, unknown>>(o: T): T {
  const r = { ...o }
  for (const [k, v] of Object.entries(r)) if (v === '') (r as Record<string, unknown>)[k] = null
  return r
}

function conflit(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/correspondance_unite_code_unique/.test(m)) return 'Ce code est déjà déclaré par une autre correspondance. Modifiez la ligne existante plutôt que d\'en créer une seconde.'
  if (/correspondance_unite_glpi_unique/.test(m)) return 'Cette unité GLPI est déjà associée à une autre correspondance. Une unité ne se rattache qu\'une fois.'
  if (/correspondance_unite_ldap_unique/.test(m)) return 'Ce libellé d\'annuaire est déjà déclaré. Une seule ligne peut le porter.'
  if (/column .* does not exist|libelle_ldap/i.test(m)) return 'La base n\'a pas la colonne « libellé annuaire » : la migration 0057 n\'a pas été jouée. Lancez ./deploy/migrer.sh sur le serveur.'
  return `Écriture refusée : ${m}`
}

const INCOMPLETE = 'Connecteur incomplet : URL, compte de service, mot de passe et DN de base sont requis.'

export const ldapRouter = new Elysia({ name: 'ldap', prefix: '/api/ldap' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Connecteurs'] } })

  .get('/config', async () => masquer(await lireConfigLdap()), { auth: ['admin'] })

  .put('/config', async ({ body }) => {
    const c = await lireConfigLdap()
    await db.update(connecteurLdap)
      .set({
        url: body.url?.trim() || null,
        bindDn: body.bindDn?.trim() || null,
        // Chiffré à l'enregistrement ; vide = inchangé, pour qu'un formulaire rouvert
        // n'efface pas le secret qu'il n'affiche pas.
        motDePasse: body.motDePasse?.trim() ? chiffrer(body.motDePasse.trim()) : c?.motDePasse,
        baseDn: body.baseDn?.trim() || c?.baseDn,
        filtre: body.filtre?.trim() || c?.filtre,
        actif: body.actif ?? false,
        frequenceHeures: Math.max(0, Number(body.frequenceHeures) || 0),
        updatedAt: new Date(),
      })
      .where(eq(connecteurLdap.id, SINGLETON_LDAP))
    return masquer(await lireConfigLdap())
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      bindDn: t.Optional(t.String()),
      motDePasse: t.Optional(t.String()),
      baseDn: t.Optional(t.String()),
      filtre: t.Optional(t.String()),
      actif: t.Optional(t.Boolean()),
      frequenceHeures: t.Optional(t.Number()),
    }),
  })

  /** Vérifie la liaison sans lire une seule personne. */
  .post('/test', async () => {
    const cfg = await configLdapComplete()
    if (!cfg) return { ok: false as const, message: INCOMPLETE }
    return testerLdap(cfg)
  }, { auth: ['admin'], detail: { summary: 'Teste la connexion à l\'annuaire.' } })

  /**
   * SIMULE : les mêmes compteurs, sans rien écrire. La première synchronisation touche deux
   * mille fiches et il n'existe pas de bouton pour revenir en arrière.
   */
  .post('/simuler', async () => {
    const cfg = await configLdapComplete()
    if (!cfg) return { ok: false as const, message: INCOMPLETE }
    try {
      return { ok: true as const, ...(await synchroniserLdap(cfg, { simuler: true })) }
    }
    catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, {
    can: { category: 'personnes', level: 'write' },
    detail: {
      summary: 'Compte ce qu\'une synchronisation ferait, sans l\'écrire.',
      description: 'Rend les mêmes compteurs que /synchroniser. `sansRattachement` et `aRapprocher` '
        + 'disent ce que vaudra la ventilation : le premier compte les personnes qu\'aucun code ne '
        + 'rattache, le second les codes que la table de correspondance ne connaît pas encore.',
    },
  })

  .post('/synchroniser', async () => {
    const cfg = await configLdapComplete()
    if (!cfg) return { ok: false as const, message: INCOMPLETE }
    await db.update(connecteurLdap).set({ dernierStatut: 'en_cours' }).where(eq(connecteurLdap.id, SINGLETON_LDAP))
    try {
      const r = await synchroniserLdap(cfg)
      await db.update(connecteurLdap).set({
        dernierSyncAt: new Date(), dernierStatut: 'ok', dernierMessage: r.message,
        dernierComptes: r, updatedAt: new Date(),
      }).where(eq(connecteurLdap.id, SINGLETON_LDAP))
      return { ok: true as const, ...r }
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // L'ÉCHEC EST ENREGISTRÉ. Sans cela, un connecteur en panne et un annuaire vide se
      // ressemblent : même absence de personnes nouvelles, aucun signal.
      await db.update(connecteurLdap).set({
        dernierStatut: 'erreur', dernierMessage: message, updatedAt: new Date(),
      }).where(eq(connecteurLdap.id, SINGLETON_LDAP))
      return { ok: false as const, message }
    }
  }, { can: { category: 'personnes', level: 'write' }, detail: { summary: 'Synchronise les personnes depuis l\'annuaire.' } })

  // --- La correspondance des unités -------------------------------------------------
  .get('/correspondances', async () =>
    db.select().from(correspondanceUnite).orderBy(asc(correspondanceUnite.nature), asc(correspondanceUnite.code)),
  { can: { category: 'personnes', level: 'read' } })

  .post('/correspondances', async ({ body, status }) => {
    try {
      const [row] = await db.insert(correspondanceUnite)
        .values({ ...vider(body), nature: body.nature as never, typeComposante: (body.typeComposante || null) as never, source: 'manuelle' })
        .returning()
      return row
    }
    catch (e) {
      // UN DOUBLON N'EST PAS UNE PANNE. Un code, un nom GLPI ou un libellé d'annuaire ne
      // désigne qu'une unité : une seconde ligne rendrait le rapprochement non déterministe,
      // donc variable d'une synchronisation à l'autre.
      return status(409, conflit(e))
    }
  }, {
    can: { category: 'personnes', level: 'write' },
    body: t.Object({
      code: t.Optional(t.Nullable(t.String())),
      nomGlpi: t.Optional(t.Nullable(t.String())),
      libelleLdap: t.Optional(t.Nullable(t.String())),
      fusionneeAvec: t.Optional(t.Nullable(t.String())),
      nature: t.String(),
      typeComposante: t.Optional(t.Nullable(t.String())),
      intitule: t.String(),
      sigle: t.Optional(t.Nullable(t.String())),
      composanteCode: t.Optional(t.Nullable(t.String())),
      note: t.Optional(t.Nullable(t.String())),
    }),
  })

  .patch('/correspondances/:id', async ({ params, body, status }) => {
    try {
      const [row] = await db.update(correspondanceUnite)
        .set({ ...vider(body), nature: (body.nature || undefined) as never, typeComposante: (body.typeComposante || null) as never, updatedAt: new Date() })
        .where(eq(correspondanceUnite.id, params.id))
        .returning()
      return row ?? null
    }
    catch (e) {
      // Associer une unité GLPI déjà prise par une autre ligne : le cas le plus fréquent
      // de cet écran, et celui qui doit dire QUI la porte déjà.
      return status(409, conflit(e))
    }
  }, {
    can: { category: 'personnes', level: 'write' },
    body: t.Object({
      code: t.Optional(t.Nullable(t.String())),
      nomGlpi: t.Optional(t.Nullable(t.String())),
      libelleLdap: t.Optional(t.Nullable(t.String())),
      fusionneeAvec: t.Optional(t.Nullable(t.String())),
      nature: t.Optional(t.String()),
      typeComposante: t.Optional(t.Nullable(t.String())),
      intitule: t.Optional(t.String()),
      sigle: t.Optional(t.Nullable(t.String())),
      composanteCode: t.Optional(t.Nullable(t.String())),
      note: t.Optional(t.Nullable(t.String())),
    }),
  })

  .delete('/correspondances/:id', async ({ params }) => {
    await db.delete(correspondanceUnite).where(eq(correspondanceUnite.id, params.id))
    return { ok: true as const }
  }, { can: { category: 'personnes', level: 'write' } })

  /**
   * LES LISTES DÉROULANTES, dérivées de ce que les sources contiennent réellement.
   */
  .get('/valeurs-vues', async () => {
    const [ldap, glpi, corr] = await Promise.all([
      db.select().from(uniteVue).orderBy(asc(uniteVue.provenance)),
      valeursGlpi(),
      db.select().from(correspondanceUnite),
    ])
    // Ce qui est DÉJÀ déclaré, marqué comme tel : proposer à nouveau une valeur rangée
    // ferait recréer un doublon, et la contrainte d'unicité le refuserait sans expliquer.
    const codes = new Set(corr.filter(c => c.code).map(c => c.code!))
    const noms = new Set(corr.filter(c => c.nomGlpi).map(c => c.nomGlpi!))
    return {
      // Les codes de l'annuaire, avec le nombre de personnes derrière chacun.
      ldap: ldap.map(v => ({ ...v, declaree: !!v.code && codes.has(v.code) })),
      // Les unités de GLPI, avec le nombre de machines et leur niveau dans l'arbre.
      glpi: glpi.map(v => ({ ...v, declaree: noms.has(v.valeur) })),
    }
  }, {
    can: { category: 'personnes', level: 'read' },
    detail: {
      summary: 'Ce que les deux sources contiennent réellement, pour les listes de saisie.',
      description: 'Les valeurs GLPI sont CALCULÉES à la lecture, jamais stockées : elles changent à '
        + 'chaque synchronisation GLPI, et une copie vieillirait en silence. `declaree` dit qu\'une '
        + 'correspondance existe déjà pour cette valeur.',
    },
  })

  /**
   * LA FILE « À RAPPROCHER » — ce que le relevé a vu et que la table ignore.
   */
  .get('/a-rapprocher', async () => {
    const lignes = await fileARapprocher()
    return { total: lignes.length, personnes: lignes.reduce((n, l) => n + l.effectif, 0), lignes }
  }, {
    can: { category: 'personnes', level: 'read' },
    detail: {
      summary: 'Unités rencontrées et non déclarées dans la correspondance.',
      description: 'Une unité dans cette file n\'est PAS rattachée : les personnes qu\'elle porte '
        + 'comptent dans `sansRattachement`. Ce n\'est pas une erreur, c\'est une déclaration qui '
        + 'manque — et le nombre de personnes dit si elle vaut le geste.',
    },
  })

  /**
   * COUVERTURE MFA par unité. Même forme que la couverture EDR, sur les personnes.
   */
  .get('/mfa/couverture', async () => couvertureMfa(), {
    can: { category: 'personnes', level: 'read' },
    detail: {
      summary: 'Activation de la MFA, ventilée par composante.',
      description: 'Déduite de la PRÉSENCE de `ufcMailPersoMFA` dans l\'annuaire, jamais de son '
        + 'contenu : l\'adresse de recours n\'est pas stockée. `nonReleve` est compté À PART et '
        + 'n\'entre pas dans `sansMfa` — une fiche jamais relevée n\'est pas une fiche sans MFA, et '
        + 'les additionner annoncerait un trou de couverture là où il n\'y a qu\'une absence '
        + 'd\'information. La ligne « (sans rattachement) » porte les personnes qu\'aucun code ne '
        + 'rattache : sans elle, la somme des lignes serait inférieure au total.',
    },
  })
