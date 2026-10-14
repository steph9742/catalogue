// CONTRÔLE DE COHÉRENCE DE LA CONFIGURATION, au démarrage. Écrit après une mise en service où
// `PUBLIC_URL` contenait le sous-chemin ALORS QUE `BASE_PATH` le portait déjà.

type Anomalie = { variable: string, probleme: string, correction: string }

// Les deux jeux de noms : `OIDC_*` est publié, `OUATE_*` reste lu pour qu'une instance
// déjà déployée n'ait rien à changer. Les messages, eux, ne citent que les noms publiés.
const oidc = (nom: string) => process.env[`OIDC_${nom}`]?.trim() || process.env[`OUATE_${nom}`]?.trim()

export function verifierConfig(): void {
  const anomalies: Anomalie[] = []
  const publicUrl = process.env.PUBLIC_URL?.trim()
  const basePath = process.env.BASE_PATH?.trim()

  // --- PUBLIC_URL : origine seule, sans chemin ---------------------------------------
  if (publicUrl) {
    try {
      const u = new URL(publicUrl)
      if (u.pathname && u.pathname !== '/') {
        anomalies.push({
          variable: 'PUBLIC_URL',
          probleme: `contient un chemin (« ${u.pathname} ») alors qu'elle doit porter l'ORIGINE SEULE.`
            + (basePath ? ` Le compose y ajoute BASE_PATH (« ${basePath} ») : l'adresse publique est doublée.` : ''),
          correction: `PUBLIC_URL=${u.origin}${basePath ? `   (et BASE_PATH=${basePath})` : ''}`,
        })
      }
      if (publicUrl.endsWith('/')) {
        anomalies.push({
          variable: 'PUBLIC_URL',
          probleme: 'se termine par une barre oblique, ce qui produit des adresses à double barre.',
          correction: `PUBLIC_URL=${publicUrl.replace(/\/+$/, '')}`,
        })
      }
    }
    catch {
      anomalies.push({
        variable: 'PUBLIC_URL',
        probleme: `n'est pas une URL valide (« ${publicUrl} »).`,
        correction: 'PUBLIC_URL=https://votre-domaine',
      })
    }
  }

  // --- BASE_PATH : barre oblique au début, aucune à la fin ----------------------------
  if (basePath) {
    if (!basePath.startsWith('/')) {
      anomalies.push({
        variable: 'BASE_PATH',
        probleme: `ne commence pas par « / » (« ${basePath} »).`,
        correction: `BASE_PATH=/${basePath.replace(/^\/+|\/+$/g, '')}`,
      })
    }
    if (basePath.endsWith('/')) {
      anomalies.push({
        variable: 'BASE_PATH',
        probleme: 'se termine par « / », ce qui produit des adresses à double barre.',
        correction: `BASE_PATH=${basePath.replace(/\/+$/, '')}`,
      })
    }
  }

  // --- TRUSTED_ORIGINS : doit couvrir l'origine publique -------------------------------
  const origines = process.env.TRUSTED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []
  if (publicUrl && origines.length) {
    try {
      const attendue = new URL(publicUrl).origin
      if (!origines.some(o => { try { return new URL(o).origin === attendue } catch { return false } })) {
        anomalies.push({
          variable: 'TRUSTED_ORIGINS',
          probleme: `ne contient pas l'origine publique « ${attendue} » : les requêtes du navigateur seront refusées.`,
          correction: `TRUSTED_ORIGINS=${attendue}`,
        })
      }
    }
    catch { /* PUBLIC_URL déjà signalée ci-dessus */ }
  }

  // --- SSO : cohérence de la déclaration ----------------------------------------------
  const clientId = oidc('CLIENT_ID')
  if (clientId) {
    if (!oidc('DISCOVERY_URL')) {
      anomalies.push({
        variable: 'OIDC_DISCOVERY_URL',
        probleme: "est vide alors que OIDC_CLIENT_ID est renseigné : le fournisseur ne peut pas être découvert.",
        correction: 'OIDC_DISCOVERY_URL=https://<votre-dex>/.well-known/openid-configuration',
      })
    }
    if (!oidc('CLIENT_SECRET')) {
      anomalies.push({
        variable: 'OIDC_CLIENT_SECRET',
        probleme: 'est vide : Dex refusera le client.',
        correction: 'OIDC_CLIENT_SECRET=<le secret déclaré dans staticClients>',
      })
    }
    // Sous-chemin SANS URL de rappel forcée : le cas qui échoue en « invalid redirect_uri »
    // alors que tout le reste semble correct.
    if (basePath && !oidc('REDIRECT_URI')) {
      const origine = (() => { try { return new URL(publicUrl ?? '').origin } catch { return 'https://<domaine>' } })()
      anomalies.push({
        variable: 'OIDC_REDIRECT_URI',
        probleme: `est vide alors que l'application est servie sous « ${basePath} ». Le reverse retire le préfixe :`
          + " l'URL de rappel calculée automatiquement le perdrait, et Dex répondrait « invalid redirect_uri ».",
        correction: `OIDC_REDIRECT_URI=${origine}${basePath}/api/auth/oauth2/callback/${process.env.OIDC_PROVIDER_ID?.trim() || 'ouate'}`
          + '   (à déclarer À L\'IDENTIQUE dans redirectURIs côté Dex)',
      })
    }
  }
  else if (oidc('CLIENT_SECRET') || oidc('DISCOVERY_URL')) {
    anomalies.push({
      variable: 'OIDC_CLIENT_ID',
      probleme: "est vide alors que d'autres variables OIDC_* sont renseignées : le SSO reste DÉSACTIVÉ.",
      correction: "OIDC_CLIENT_ID=<l'identifiant du client déclaré dans Dex>",
    })
  }

  // --- Secret d'authentification laissé au défaut --------------------------------------
  if ((process.env.BETTER_AUTH_SECRET ?? '') === 'change-me') {
    anomalies.push({
      variable: 'BETTER_AUTH_SECRET',
      probleme: 'vaut encore « change-me » : les sessions sont signées avec un secret public.',
      correction: 'BETTER_AUTH_SECRET=<chaîne aléatoire longue>',
    })
  }

  if (!anomalies.length) return

  console.warn('')
  console.warn('⚠️  CONFIGURATION INCOHÉRENTE — l\'application démarre, mais ne fonctionnera pas correctement :')
  for (const a of anomalies) {
    console.warn('')
    console.warn(`   ${a.variable} ${a.probleme}`)
    console.warn(`   → ${a.correction}`)
  }
  console.warn('')
  console.warn('   Corrigez .env puis relancez : docker compose up -d app server')
  console.warn('')
}

// JOIGNABILITÉ DU FOURNISSEUR D'IDENTITÉ. Une configuration peut être parfaitement cohérente et
// le SSO rester inopérant : il suffit que le CONTENEUR ne puisse pas joindre l'adresse publique
// de Dex.
export async function verifierAccesSso(): Promise<void> {
  const url = oidc('DISCOVERY_URL')
  if (!oidc('CLIENT_ID') || !url) return

  const detail = (cause: string) => {
    console.warn('')
    console.warn(`⚠️  SSO INJOIGNABLE — le fournisseur d'identité ne répond pas au serveur : ${cause}`)
    console.warn(`   ${url}`)
    console.warn('')
    console.warn("   L'application démarre, mais toute tentative de connexion par SSO échouera en 500.")
    console.warn('   Vérifiez depuis le conteneur lui-même, et non depuis un navigateur :')
    console.warn(`     docker compose exec server bun -e 'console.log((await fetch("${url}")).status)'`)
    console.warn('')
    console.warn("   Si l'adresse répond depuis l'hôte mais pas depuis le conteneur, c'est le")
    console.warn("   retour de boucle réseau. Renseignez dans .env le nom d'hôte à router vers")
    console.warn("   la passerelle, puis recréez le conteneur :")
    console.warn(`     AUTH_HOST_INTERNE=${(() => { try { return new URL(url).hostname } catch { return '<hôte>' } })()}`)
    console.warn('     docker compose up -d --force-recreate server')
    console.warn('')
  }

  try {
    // Délai borné : un fournisseur qui ne répond pas ne doit pas retarder le démarrage.
    const reponse = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!reponse.ok) return detail(`réponse ${reponse.status}`)
    const doc = await reponse.json() as { issuer?: string, authorization_endpoint?: string }
    if (!doc.authorization_endpoint) return detail("le document renvoyé n'est pas une découverte OpenID valide")
    console.log(`🔑 SSO joignable — fournisseur « ${doc.issuer ?? url} »`)
  }
  catch (e) {
    detail(e instanceof Error ? e.message : String(e))
  }
}
