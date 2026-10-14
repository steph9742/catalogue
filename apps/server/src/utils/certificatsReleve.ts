import { and, asc, eq, isNotNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { certificat } from '@catalogue/database/tables'
import { champsLisibles, releverCaa, scannerCertificat } from './certificatScan'

// RELEVÉ DES CERTIFICATS — sorti de la route pour que l'ordonnanceur l'appelle aussi.

const LIMITE_SCAN = 200
const PAQUET = 8

export async function scannerCertificats(opts: { id?: string } = {}): Promise<{ scannes: number, ok: number, echecs: number, tronque: boolean }> {
  const cibles = opts.id
    ? await db.select().from(certificat).where(eq(certificat.id, opts.id))
    : await db.select().from(certificat).where(eq(certificat.surveille, true))
      .orderBy(sql`${certificat.dernierScanAt} asc nulls first`, asc(certificat.hote)).limit(LIMITE_SCAN)

  let ok = 0
  let echecs = 0
  // Les scans sont menés par petits paquets et non tous à la fois : quelques centaines de
  // connexions TLS simultanées ressemblent à un balayage et se font jeter par les pare-feu.
  for (let i = 0; i < cibles.length; i += PAQUET) {
    await Promise.all(cibles.slice(i, i + PAQUET).map(async (c) => {
      // Le CAA dans le même passage : il dit quelles autorités ont le droit d'émettre.
      const [r, caa] = await Promise.all([scannerCertificat(c.hote, c.port), releverCaa(c.hote)])
      if (r.statut === 'ok') ok++
      else echecs++
      await db.update(certificat).set({
        // Le relevé n'est écrit QUE s'il y a eu quelque chose à lire : un hôte momentanément
        // injoignable ne doit pas effacer la date d'expiration connue.
        ...champsLisibles(r),
        // `null` : résolution DNS en échec. On n'écrase pas ce qu'on savait.
        ...(caa !== null ? { caa } : {}),
        dernierScanAt: new Date(),
        dernierStatut: r.statut,
        dernierMessage: r.message,
        updatedAt: new Date(),
      }).where(eq(certificat.id, c.id))
    }))
  }

  // Une troncature muette ferait passer un scan partiel pour complet.
  return { scannes: cibles.length, ok, echecs, tronque: !opts.id && cibles.length === LIMITE_SCAN }
}

/**
 * Relève SI quelque chose est à relever : un certificat surveillé jamais scanné, ou scanné il y
 * a plus de `ageMs`.
 */
export async function scannerCertificatsSiDu(ageMs: number): Promise<{ lance: boolean, scannes: number, ok: number, echecs: number, tronque: boolean }> {
  const seuil = new Date(Date.now() - ageMs)
  const [aFaire] = await db.select({ id: certificat.id }).from(certificat)
    .where(and(
      eq(certificat.surveille, true),
      or(sql`${certificat.dernierScanAt} is null`, and(isNotNull(certificat.dernierScanAt), lt(certificat.dernierScanAt, seuil))),
    )).limit(1)
  if (!aFaire) return { lance: false, scannes: 0, ok: 0, echecs: 0, tronque: false }
  return { lance: true, ...await scannerCertificats() }
}
