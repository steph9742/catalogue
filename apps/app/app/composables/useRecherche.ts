// État partagé de la palette de recherche : elle doit pouvoir être ouverte depuis PLUSIEURS
// endroits (barre latérale, barre supérieure, raccourci clavier) — la recherche ne doit jamais
// dépendre d'un seul point d'entrée, encore moins du seul clavier.
export function useRecherche() {
  const ouverte = useState('recherche-ouverte', () => false)
  return {
    ouverte,
    ouvrir: () => { ouverte.value = true },
    fermer: () => { ouverte.value = false },
  }
}
