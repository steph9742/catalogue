// BALAYAGE EN ARRIÈRE-PLAN — par paquets, avec plafond, un seul à la fois.

export type EtatBalayage = {
  enCours: boolean
  debut: string | null
  fin: string | null
  /** Cibles RETENUES pour ce passage, plafond appliqué. */
  total: number
  traites: number
  ok: number
  echecs: number
  detections: number
  /** Le plafond a écarté des cibles : le passage n'a PAS tout relevé. */
  tronque: boolean
  /** Cibles écartées par le plafond. Annoncé, jamais tu. */
  ecartes: number
}

export type ResultatCible = { ok: boolean, detections: number }

const initial = (): EtatBalayage => ({
  enCours: false, debut: null, fin: null, total: 0, traites: 0,
  ok: 0, echecs: 0, detections: 0, tronque: false, ecartes: 0,
})

export function creerBalayage(opts: { paquet: number, plafond: number }) {
  let etat = initial()
  let courant: Promise<void> | null = null

  return {
    /** Une copie : l'appelant ne doit pas pouvoir altérer l\'état du balayage en cours. */
    etat: (): EtatBalayage => ({ ...etat }),

    /**
     * Lance le balayage et rend la main immédiatement. Les cibles arrivent DÉJÀ ORDONNÉES :
     * c'est l\'appelant qui décide lesquelles passent sous le plafond (les plus anciennement
     * relevées, pour que les passages successifs couvrent tout le parc).
     */
    lancer<T>(cibles: readonly T[], relever: (c: T) => Promise<ResultatCible>): { demarre: boolean } {
      // UN SEUL À LA FOIS. Deux balayages simultanés doubleraient la charge sur les hôtes
      // et écriraient les mêmes lignes dans un ordre imprévisible.
      if (etat.enCours) return { demarre: false }

      const retenues = cibles.slice(0, opts.plafond)
      etat = {
        ...initial(),
        enCours: true,
        debut: new Date().toISOString(),
        total: retenues.length,
        tronque: cibles.length > retenues.length,
        ecartes: cibles.length - retenues.length,
      }

      courant = (async () => {
        try {
          for (let i = 0; i < retenues.length; i += opts.paquet) {
            await Promise.all(retenues.slice(i, i + opts.paquet).map(async (c) => {
              try {
                const r = await relever(c)
                if (r.ok) { etat.ok++; etat.detections += r.detections }
                else etat.echecs++
              }
              catch (e) {
                // UNE CIBLE QUI LÈVE N'ARRÊTE PAS LE PARCOURS. Elle compte en échec : la taire
                // ferait passer le passage pour complet, l'arrêter priverait toutes les
                // suivantes de relevé.
                etat.echecs++
                console.error('[balayage] relevé en erreur —', e instanceof Error ? e.message : String(e))
              }
              finally { etat.traites++ }
            }))
          }
        }
        finally {
          etat.enCours = false
          etat.fin = new Date().toISOString()
        }
      })()
      return { demarre: true }
    },

    /** Pour les contrôles : attendre la fin du balayage en cours. */
    attendre: (): Promise<void> => courant ?? Promise.resolve(),
  }
}
