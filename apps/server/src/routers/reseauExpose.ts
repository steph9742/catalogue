import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  composante, equipementReseau, fluxReseau, interconnexionExterne, lienReseau, zoneReseau,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// TOPOLOGIE RÉSEAU — zones, VLAN, liens, interconnexions et flux autorisés.

export const reseauExposeRouter = new Elysia({ name: 'reseau-expose', prefix: '/api/reseau' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Cartographie'] } })

  .get('/topologie', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const lisible = ['zones-reseau', 'equipements-reseau', 'flux-reseau', 'liens-reseau', 'interconnexions-externes']
      .filter(c => cats.has(c))
    if (!lisible.length) {
      return { lisible: false, avertissements: ['Aucune catégorie réseau n\'est lisible par cet appelant.'], zones: [], equipements: [], liens: [], interconnexions: [], flux: [] }
    }

    const zones = cats.has('zones-reseau')
      ? await db.select().from(zoneReseau).orderBy(asc(zoneReseau.nom))
      : []
    const equipements = cats.has('equipements-reseau')
      ? await db.select({
        id: equipementReseau.id, nom: equipementReseau.nom, type: equipementReseau.type,
        marque: equipementReseau.marque, modele: equipementReseau.modele,
        osFirmware: equipementReseau.osFirmware, ipGestion: equipementReseau.ipGestion,
        localisation: equipementReseau.localisation, statut: equipementReseau.statut,
        composante: composante.nom,
      }).from(equipementReseau)
        .leftJoin(composante, eq(composante.id, equipementReseau.composanteId))
        .orderBy(asc(equipementReseau.nom))
      : []
    const liens = cats.has('liens-reseau')
      ? await db.select({
        id: lienReseau.id, nom: lienReseau.nom, type: lienReseau.type, portee: lienReseau.portee,
        debit: lienReseau.debit, portA: lienReseau.portA, portB: lienReseau.portB,
        equipementAId: lienReseau.equipementAId, equipementBId: lienReseau.equipementBId,
        description: lienReseau.description,
      }).from(lienReseau).orderBy(asc(lienReseau.nom))
      : []
    const interco = cats.has('interconnexions-externes')
      ? await db.select().from(interconnexionExterne).orderBy(asc(interconnexionExterne.nom))
      : []
    const flux = cats.has('flux-reseau')
      ? await db.select({
        id: fluxReseau.id, nom: fluxReseau.nom, protocole: fluxReseau.protocole, port: fluxReseau.port,
        statut: fluxReseau.statut, justification: fluxReseau.justification,
        sourceZoneId: fluxReseau.sourceZoneId, destinationZoneId: fluxReseau.destinationZoneId,
      }).from(fluxReseau).orderBy(asc(fluxReseau.nom))
      : []

    // Résolution des identifiants en NOMS. Un flux « zone abc123 → zone def456 » n'est pas
    // une réponse : c'est une donnée qu'il faudrait aller traduire ailleurs.
    const nomZone = new Map(zones.map(z => [z.id, z.nom]))
    const nomEquip = new Map(equipements.map(e => [e.id, e.nom]))

    const fluxResolus = flux.map(f => ({
      ...f,
      source: nomZone.get(f.sourceZoneId ?? '') ?? null,
      destination: nomZone.get(f.destinationZoneId ?? '') ?? null,
      // Le point qui compte : un flux ouvert sans justification écrite.
      sansJustification: !f.justification?.trim(),
      urlAbsolue: urlPublique(`/flux-reseau/${f.id}`),
    }))
    const liensResolus = liens.map(l => ({
      ...l,
      equipementA: nomEquip.get(l.equipementAId ?? '') ?? null,
      equipementB: nomEquip.get(l.equipementBId ?? '') ?? null,
      urlAbsolue: urlPublique(`/liens-reseau/${l.id}`),
    }))

    const filtreZone = query.zone ? String(query.zone).toLowerCase() : null
    const fluxFiltres = filtreZone
      ? fluxResolus.filter(f => (f.source ?? '').toLowerCase().includes(filtreZone) || (f.destination ?? '').toLowerCase().includes(filtreZone))
      : fluxResolus

    const avertissements: string[] = []
    const absentes = ['zones-reseau', 'equipements-reseau', 'flux-reseau', 'liens-reseau', 'interconnexions-externes'].filter(c => !cats.has(c))
    if (absentes.length) {
      avertissements.push(`Catégories hors de la portée de l'appelant : ${absentes.join(', ')}. La topologie rendue est INCOMPLÈTE.`)
    }
    avertissements.push('Cette cartographie est SAISIE, pas découverte : elle décrit ce que l\'équipe a déclaré, '
      + 'pas ce que le réseau porte réellement. Un équipement ou un flux non saisi est invisible ici.')

    return {
      lisible: true,
      tri: 'nom, pour chaque famille',
      comptes: {
        zones: zones.length,
        equipements: equipements.length,
        liens: liensResolus.length,
        interconnexions: interco.length,
        flux: fluxFiltres.length,
        // Un flux autorisé sans justification : l'équivalent réseau d'une liste blanche
        // sans motif.
        fluxSansJustification: fluxResolus.filter(f => f.sansJustification).length,
      },
      avertissements,
      zones: zones.map(z => ({
        id: z.id, nom: z.nom, type: z.type, vlan: z.vlanId, cidr: z.cidr,
        niveau: z.niveau, description: z.description,
        urlAbsolue: urlPublique(`/zones-reseau/${z.id}`),
      })),
      equipements: equipements.map(e => ({ ...e, urlAbsolue: urlPublique(`/equipements-reseau/${e.id}`) })),
      liens: liensResolus,
      // Les interconnexions externes sont la surface d'exposition : elles méritent d'être
      // lues à part, pas noyées parmi les liens internes.
      interconnexions: interco.map(i => ({
        id: i.nom ? i.id : i.id, nom: i.nom, type: i.type, fournisseur: i.fournisseur,
        debit: i.debit, description: i.description,
        equipement: nomEquip.get(i.equipementId ?? '') ?? null,
        urlAbsolue: urlPublique(`/interconnexions/${i.id}`),
      })),
      flux: fluxFiltres,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ zone: t.Optional(t.String()) }),
    detail: {
      summary: 'Topologie réseau : zones et VLAN, équipements, liens, interconnexions externes et flux autorisés.',
      description: 'Les identifiants sont résolus en NOMS — un flux « zone abc123 → def456 » n\'est pas une '
        + 'réponse citable. `comptes.fluxSansJustification` compte les flux ouverts sans justification écrite : '
        + 'l\'équivalent réseau d\'une liste blanche sans motif. `zone=` filtre les flux par nom de zone '
        + 'source ou destination. AVERTISSEMENT PERMANENT : cette cartographie est SAISIE, pas découverte — '
        + 'ce qui n\'a pas été déclaré est invisible.',
    },
  })
