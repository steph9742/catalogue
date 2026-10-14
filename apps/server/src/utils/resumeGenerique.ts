import { getTableColumns, sql, type Column } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db } from '@catalogue/database'
import { application, composante, departement, entite, lieu, personne, pole, service, tiers } from '@catalogue/database/tables'
import { partitionAvecNul } from './partition'
import { ventiler, type Ventilation } from './ventilation'

// RÉSUMÉ GÉNÉRIQUE — un décompte par axe de filtre, pour TOUS les catalogues.

/**
 * Les référentiels sur lesquels on sait ventiler. ÉCRIT UNE FOIS, utilisé par tous les
 * catalogues.
 */
const REFERENTIELS: Record<string, { table: PgTable, id: Column, nom: Column, axe: string }> = {
  composanteId: { table: composante, id: composante.id, nom: composante.nom, axe: '/api/composantes' },
  serviceId: { table: service, id: service.id, nom: service.nom, axe: '/api/services' },
  departementId: { table: departement, id: departement.id, nom: departement.nom, axe: '/api/departements' },
  lieuId: { table: lieu, id: lieu.id, nom: lieu.nom, axe: '/api/lieux' },
  poleId: { table: pole, id: pole.id, nom: pole.nom, axe: '/api/poles' },
  entiteId: { table: entite, id: entite.id, nom: entite.nom, axe: '/api/entites' },
  editeurId: { table: tiers, id: tiers.id, nom: tiers.nom, axe: '/api/tiers' },
  responsableId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  responsableMetierId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  responsableTechniqueId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  // `proprietaireId` manquait, et six catalogues s'en servent — actifs informationnels,
  // processus, actifs et risques SMSI, et les services exposés.
  proprietaireId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  // Le contact technique d'un service exposé : même référentiel, autre rôle. Sans axe, « qui
  // répond techniquement de nos sites » n'aurait pas de ventilation.
  contactTechniqueId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  // L'application n'est pas un axe ORGANISATIONNEL, mais c'est un référentiel : « combien de
  // services exposés par application » désigne un responsable aussi sûrement qu'une composante,
  // et c'est la question qu'on pose d'un site web.
  applicationId: { table: application, id: application.id, nom: application.nom, axe: '/api/applications' },
  // Ces six-là manquaient aussi, et un contrôle sur les clés étrangères RÉELLES les a révélées
  // d'un coup.
  utilisateurPrincipalId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  technicienId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  referentId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  valideParId: { table: personne, id: personne.id, nom: personne.nom, axe: '/api/personnes' },
  tiersId: { table: tiers, id: tiers.id, nom: tiers.nom, axe: '/api/tiers' },
  sourceApplicationId: { table: application, id: application.id, nom: application.nom, axe: '/api/applications' },
  destinationApplicationId: { table: application, id: application.id, nom: application.nom, axe: '/api/applications' },
}

/**
 * Les tables qui SONT des référentiels — celles vers lesquelles pointer vaut un axe.
 */
export const TABLES_REFERENTIELLES = new Set(Object.values(REFERENTIELS).map(r => r.table))

/** Les colonnes déclarées comme axes, pour les contrôles. */
export const COLONNES_AXES = new Set(Object.keys(REFERENTIELS))

export type ResumeGenerique = {
  total: number
  /** Un bloc par colonne d'énumération. Vocabulaire fermé : la somme fait `total`. */
  partitions: Record<string, Record<string, number>>
  /** Un bloc par clé étrangère connue. Axe de référentiel : `sansRattachement` complète. */
  ventilations: Record<string, Ventilation>
  /** Les colonnes qui portent un axe, pour que l'appelant sache ce qu\'il peut demander. */
  axes: { partitions: string[], ventilations: string[] }
}

/** Décrit les axes d'une table sans interroger la base — sert aux contrôles et à /api/lectures. */
export function axesDe(table: PgTable): { enums: Array<{ champ: string, valeurs: readonly string[] }>, refs: string[] } {
  const cols = getTableColumns(table) as Record<string, Column & { enumValues?: readonly string[] }>
  return {
    enums: Object.entries(cols)
      .filter(([, c]) => Array.isArray(c.enumValues) && c.enumValues.length > 0)
      .map(([champ, c]) => ({ champ, valeurs: c.enumValues as readonly string[] })),
    refs: Object.keys(cols).filter(champ => champ in REFERENTIELS),
  }
}

/**
 * LES FILTRES ACCEPTÉS PAR UN CATALOGUE, dérivés de ses colonnes. POURQUOI CECI EXISTE.
 */
export type FiltreDeclare = {
  champ: string
  /** `vocabulaire` : valeurs fermées, énumérées ici. `referentiel` : voir `axe`. */
  nature: 'vocabulaire' | 'referentiel' | 'booleen' | 'texte' | 'nombre' | 'date'
  valeurs?: readonly string[]
  axe?: string
}

export function filtresDe(table: PgTable): FiltreDeclare[] {
  const cols = getTableColumns(table) as Record<string, Column & { enumValues?: readonly string[] }>
  return Object.entries(cols).map(([champ, c]) => {
    if (Array.isArray(c.enumValues) && c.enumValues.length) {
      return { champ, nature: 'vocabulaire' as const, valeurs: c.enumValues as readonly string[] }
    }
    if (champ in REFERENTIELS) {
      return { champ, nature: 'referentiel' as const, axe: REFERENTIELS[champ]!.axe }
    }
    const nature = c.dataType === 'boolean'
      ? 'booleen' as const
      : c.dataType === 'number'
        ? 'nombre' as const
        : c.dataType === 'date'
          ? 'date' as const
          : 'texte' as const
    return { champ, nature }
  })
}

export async function resumeGenerique(table: PgTable): Promise<ResumeGenerique> {
  const cols = getTableColumns(table) as Record<string, Column & { enumValues?: readonly string[] }>
  const { enums, refs } = axesDe(table)

  // Toutes les partitions en UNE requête : quarante-huit catalogues × six énumérations
  // feraient autrement trois cents allers-retours pour un écran de synthèse.
  const champs: Record<string, unknown> = { total: sql<number>`count(*)::int` }
  for (const { champ, valeurs } of enums) {
    const p = partitionAvecNul(cols[champ]!, valeurs, 'non_renseigne')
    for (const [valeur, expr] of Object.entries(p)) champs[`${champ}__${valeur}`] = expr
  }
  const [ligne] = await db.select(champs as never).from(table) as unknown as Array<Record<string, number>>

  const partitions: Record<string, Record<string, number>> = {}
  for (const { champ, valeurs } of enums) {
    partitions[champ] = Object.fromEntries(
      [...valeurs, 'non_renseigne'].map(v => [v, Number(ligne?.[`${champ}__${v}`] ?? 0)]),
    )
  }

  const ventilations: Record<string, Ventilation> = {}
  for (const champ of refs) {
    const r = REFERENTIELS[champ]!
    ventilations[champ] = await ventiler(table, cols[champ]!, r.table, r.id as never, r.nom as never, r.axe)
  }

  return {
    total: Number(ligne?.total ?? 0),
    partitions,
    ventilations,
    // Rendus explicitement : sans cette liste, un axe absent se lit « aucune valeur »
    // alors qu'il signifie « cette table ne porte pas cet axe ».
    axes: { partitions: enums.map(e => e.champ), ventilations: refs },
  }
}
