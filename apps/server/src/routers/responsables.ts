import { Elysia, t } from 'elysia'
import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, composante, composanteReferent, entite, entiteResponsable, exigenceNis2,
  exigenceNis2Responsable, personne, personneReferent, serveur, service, departement,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'

// QUI EST RESPONSABLE DE QUOI. La question la plus posée à un assistant, et celle dont la
// réponse est la plus dispersée : titres transverses (RSSI, DPO), responsables d'entité et de
// composante, référents, responsables d'application, propriétaires de serveur, responsables
// d'exigence NIS 2.

type Attribution = {
  personneId: string
  personne: string
  email: string | null
  fonction: string | null
  role: string
  objetType: string
  objetId: string | null
  objet: string
  url: string | null
  urlAbsolue: string | null
}

const nomComplet = sql<string>`trim(coalesce(${personne.prenom}, '') || ' ' || ${personne.nom})`

export const responsablesRouter = new Elysia({ name: 'responsables', prefix: '/api/responsables' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Organisation'] } })

  .get('/', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const lignes: Attribution[] = []
    const motifQui = query.qui ? `%${query.qui}%` : null
    const motifObjet = query.objet ? `%${query.objet}%` : null

    const filtrePersonne = motifQui
      ? or(ilike(personne.nom, motifQui), ilike(personne.prenom, motifQui), ilike(personne.email, motifQui))
      : undefined

    // --- Titres transverses : RSSI, DPO, RSSI adjoint… ---------------------------------
    // Ce sont eux qu'on cherche quand on demande « qui est le RSSI ? », et ils ne sont
    // rattachés à aucun objet.
    if (cats.has('personnes')) {
      const rows = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email,
        fonction: personne.fonction, titre: personneReferent.titre, kind: personneReferent.kind,
      })
        .from(personneReferent)
        .innerJoin(personne, eq(personne.id, personneReferent.personneId))
        .where(filtrePersonne)
        .orderBy(asc(personneReferent.titre))
      for (const r of rows) {
        lignes.push({
          personneId: r.personneId, personne: r.nom, email: r.email, fonction: r.fonction,
          role: r.titre, objetType: r.kind === 'referent' ? 'référent' : 'titre',
          objetId: null, objet: 'établissement', url: '/referents',
          urlAbsolue: urlPublique('/referents'),
        })
      }
    }

    // --- Responsables d'entité et de composante ---------------------------------------
    if (cats.has('composantes')) {
      const ent = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        role: entiteResponsable.role, objetId: entite.id, objet: entite.nom,
      })
        .from(entiteResponsable)
        .innerJoin(personne, eq(personne.id, entiteResponsable.personneId))
        .innerJoin(entite, eq(entite.id, entiteResponsable.entiteId))
        .where(filtrePersonne)
      for (const r of ent) {
        lignes.push({ ...r, personne: r.nom, objetType: 'entité', url: '/composantes', urlAbsolue: urlPublique('/composantes') })
      }

      const comp = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        role: composanteReferent.role, objetId: composante.id, objet: composante.nom,
      })
        .from(composanteReferent)
        .innerJoin(personne, eq(personne.id, composanteReferent.personneId))
        .innerJoin(composante, eq(composante.id, composanteReferent.composanteId))
        .where(filtrePersonne)
      for (const r of comp) {
        lignes.push({
          ...r, personne: r.nom, objetType: 'composante',
          url: `/composantes/${r.objetId}`, urlAbsolue: urlPublique(`/composantes/${r.objetId}`),
        })
      }

      // Directions de service et de département : ce sont elles qu'on cherche quand la
      // question porte sur un périmètre, pas sur un objet technique.
      const svc = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        objetId: service.id, objet: service.nom,
      })
        .from(service).innerJoin(personne, eq(personne.id, service.directeurId)).where(filtrePersonne)
      for (const r of svc) {
        lignes.push({ ...r, personne: r.nom, role: 'direction', objetType: 'service', url: `/services/${r.objetId}`, urlAbsolue: urlPublique(`/services/${r.objetId}`) })
      }
      const dep = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        objetId: departement.id, objet: departement.nom,
      })
        .from(departement).innerJoin(personne, eq(personne.id, departement.directeurId)).where(filtrePersonne)
      for (const r of dep) {
        lignes.push({ ...r, personne: r.nom, role: 'direction', objetType: 'département', url: `/departements/${r.objetId}`, urlAbsolue: urlPublique(`/departements/${r.objetId}`) })
      }
    }

    // --- Applications : responsable technique ET responsable métier --------------------
    // Les deux existent et ne se confondent pas : le premier répare, le second décide.
    if (cats.has('applications')) {
      for (const [colonne, role] of [[application.responsableId, 'responsable technique'], [application.responsableMetierId, 'responsable métier']] as const) {
        const rows = await db.select({
          personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
          objetId: application.id, objet: application.nom,
        })
          .from(application).innerJoin(personne, eq(personne.id, colonne)).where(filtrePersonne)
        for (const r of rows) {
          lignes.push({ ...r, personne: r.nom, role, objetType: 'application', url: `/applications/${r.objetId}`, urlAbsolue: urlPublique(`/applications/${r.objetId}`) })
        }
      }
    }

    if (cats.has('serveurs')) {
      const rows = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        objetId: serveur.id, objet: serveur.hostname,
      })
        .from(serveur).innerJoin(personne, eq(personne.id, serveur.responsableMetierId)).where(filtrePersonne)
      for (const r of rows) {
        lignes.push({ ...r, personne: r.nom, role: 'responsable métier', objetType: 'serveur', url: `/serveurs/${r.objetId}`, urlAbsolue: urlPublique(`/serveurs/${r.objetId}`) })
      }
    }

    if (cats.has('exigences-nis2')) {
      const rows = await db.select({
        personneId: personne.id, nom: nomComplet, email: personne.email, fonction: personne.fonction,
        role: exigenceNis2Responsable.role, objetId: exigenceNis2.id,
        objet: exigenceNis2.intitule, reference: exigenceNis2.reference,
      })
        .from(exigenceNis2Responsable)
        .innerJoin(personne, eq(personne.id, exigenceNis2Responsable.personneId))
        .innerJoin(exigenceNis2, eq(exigenceNis2.id, exigenceNis2Responsable.exigenceNis2Id))
        .where(filtrePersonne)
      for (const r of rows) {
        lignes.push({
          personneId: r.personneId, personne: r.nom, email: r.email, fonction: r.fonction,
          role: r.role, objetType: 'exigence NIS 2', objetId: r.objetId,
          objet: `${r.reference} — ${r.objet}`,
          url: `/exigences-nis2/${r.objetId}`, urlAbsolue: urlPublique(`/exigences-nis2/${r.objetId}`),
        })
      }
    }

    const filtrees = motifObjet
      ? lignes.filter(l => l.objet?.toLowerCase().includes(String(query.objet).toLowerCase()))
      : lignes

    // Le tri s'applique à la liste ENTIÈRE avant toute découpe : trier une page déjà
    // découpée donnerait un ordre stable page par page et incohérent d'une page à l'autre.
    const triees = filtrees.sort((a, b) =>
      a.objetType.localeCompare(b.objetType) || a.objet.localeCompare(b.objet) || a.role.localeCompare(b.role))

    const commun = {
      tri: 'type d\'objet, puis nom de l\'objet, puis rôle',
      avertissement: 'Un responsable absent de cette liste ne veut pas dire que personne ne s\'en occupe : '
        + 'il veut dire que personne ne l\'a écrit. Une réponse vide doit être formulée ainsi.',
    }

    // Cette route AGRÈGE plusieurs requêtes et compose sa liste en mémoire : elle ne peut pas
    // déléguer `limit`/`offset` à la base.
    if (pagineDemandee(query)) {
      const b = bornes(query)
      return { ...enveloppe(triees.slice(b.offset, b.offset + b.limit), triees.length, b), ...commun }
    }
    return { total: triees.length, ...commun, resultats: triees }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ ...SCHEMA_PAGINATION, qui: t.Optional(t.String()), objet: t.Optional(t.String()) }),
    detail: {
      summary: 'Qui est responsable de quoi : titres transverses, entités, applications, serveurs, exigences NIS 2.',
      description: '`qui=` filtre par personne (nom, prénom ou courriel) et répond à « de quoi cette '
        + 'personne s\'occupe-t-elle ? ». `objet=` filtre par objet et répond à « qui s\'occupe de ceci ? ». '
        + 'Sans paramètre, rend toutes les attributions lisibles. Applications : le responsable TECHNIQUE et '
        + 'le responsable MÉTIER sont deux rôles distincts — le premier répare, le second décide. Une réponse '
        + 'vide signifie « non écrit », jamais « personne ». '
        + '`page`/`pageSize` (l\'un des deux suffit) rendent `{ rows, total, page, pageSize }` ; sans eux, '
        + 'la forme historique `{ total, tri, avertissement, resultats }` est conservée. Cette liste est '
        + 'assemblée en mémoire : la page est découpée APRÈS le tri complet, et le total est celui de la '
        + 'liste entière.',
    },
  })
