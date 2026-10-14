import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@catalogue/database"
import { user } from "@catalogue/database/tables"
import { eq, sql } from "drizzle-orm"
import { serviceAccounts } from "@catalogue/better-auth-plugins/service-accounts";
import { admin, createAccessControl, genericOAuth } from "better-auth/plugins";

const scopesStatement = {
    permissions: ["read", "write", "delete", "admin"]
} as const;

export const scopes = createAccessControl(scopesStatement);

// SSO OIDC activé uniquement s'il est configuré. En local, sans identifiant de client,
// seule la connexion e-mail/mot de passe est disponible.
// DEUX JEUX DE NOMS, le générique d'abord. `OIDC_*` est le nom publié ; `OUATE_*` est
// l'ancien, celui du premier déploiement, et il reste lu pour qu'une instance existante
// n'ait rien à changer dans son `.env` en reprenant une version plus récente.
const oidcEnv = (nom: string): string | undefined =>
    process.env[`OIDC_${nom}`]?.trim() || process.env[`OUATE_${nom}`]?.trim() || undefined

// L'identifiant du fournisseur entre dans l'URL de rappel (/api/auth/oauth2/callback/<id>),
// déclarée chez le fournisseur : le défaut historique est conservé, sans quoi toute instance
// déjà déclarée se verrait refuser « invalid redirect_uri ». `OIDC_PROVIDER_ID` le change.
const oidcProviderId = process.env.OIDC_PROVIDER_ID?.trim() || 'ouate'
const oidcEnabled = !!oidcEnv('CLIENT_ID')

// ATTRIBUTION DU RÔLE DEPUIS L'ANNUAIRE — pourquoi ce détour. `mapProfileToUser` renvoie bien
// `role: 'admin'` quand le claim `groups` contient « admins ».
const TTL_ROLE_MS = 30_000
const rolesAttendus = new Map<string, { role: string, expire: number }>()

function memoriserRole(email: string | undefined, role: string): void {
  if (!email) return
  const maintenant = Date.now()
  // Purge opportuniste : la table ne contient que des connexions en cours, elle reste
  // minuscule. Un minuteur dédié serait disproportionné.
  for (const [cle, v] of rolesAttendus) if (v.expire < maintenant) rolesAttendus.delete(cle)
  rolesAttendus.set(email.toLowerCase(), { role, expire: maintenant + TTL_ROLE_MS })
}

/** Le rôle est consommé : une entrée ne sert qu'une fois, et expire si elle ne sert pas. */
function consommerRole(email: string | undefined): string | undefined {
  if (!email) return undefined
  const cle = email.toLowerCase()
  const v = rolesAttendus.get(cle)
  rolesAttendus.delete(cle)
  return v && v.expire >= Date.now() ? v.role : undefined
}

/**
 * `admin` si l'annuaire place la personne dans le groupe `admins`, `user` sinon.
 */
function roleDesGroupes(groupes: unknown): string | undefined {
  if (!Array.isArray(groupes)) return undefined
  return groupes.includes('admins') ? 'admin' : 'user'
}

/**
 * Aligne le rôle GLOBAL sur l'annuaire, à chaque connexion, dans les deux sens.
 */
async function alignerRoleSurAnnuaire(email: string | undefined, role: string | undefined): Promise<void> {
  if (!email || !role) return
  try {
    const [existant] = await db.select({ id: user.id, role: user.role, origine: user.roleOrigine })
      .from(user).where(eq(sql`lower(${user.email})`, email.toLowerCase())).limit(1)
    // Compte inconnu : c'est une première connexion, la création s'en chargera.
    if (!existant) return
    // Rôle posé à la main : l'application en est propriétaire, l'annuaire s'abstient.
    if (existant.origine === 'manuel') return
    if (existant.role === role && existant.origine === 'annuaire') return
    await db.update(user).set({ role, roleOrigine: 'annuaire', updatedAt: new Date() })
      .where(eq(user.id, existant.id))
    if (existant.role !== role) {
      console.log(`🔐 Rôle aligné sur l'annuaire pour ${email} : ${existant.role ?? 'aucun'} → ${role}.`)
    }
  }
  catch (e) {
    // Un échec ne doit pas empêcher la connexion : on le DIT, et l'authentification suit
    // son cours. Le rôle sera réaligné à la connexion suivante.
    console.error('❌ Alignement du rôle sur l\'annuaire —', e instanceof Error ? e.message : String(e))
  }
}

const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    emailAndPassword: {
        enabled: true,
        domain: process.env.AUTH_DOMAIN! || undefined,
    },
    advanced: {
        crossSubDomainCookies: {
            enabled: true
        },
        cookiePrefix: "catalogue",
    },
    plugins: [
        serviceAccounts({
            scopes,
            // Gestion des comptes techniques réservée aux administrateurs.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allowUserToManageServiceAccounts: (u: any) => u.role === 'admin',
        }),
        // Toujours présent (pour un typage stable), mais sans provider si l'OIDC
        // n'est pas configuré → aucune connexion réseau, connexion locale par e-mail.
        genericOAuth({
            config: oidcEnabled ? [
                {
                    providerId: oidcProviderId,
                    clientId: oidcEnv('CLIENT_ID')!,
                    clientSecret: oidcEnv('CLIENT_SECRET')!,
                    discoveryUrl: oidcEnv('DISCOVERY_URL')!,
                    // Sous-chemin : le reverse retire le préfixe, donc BETTER_AUTH_URL est
                    // l'origine seule et le callback OIDC n'inclurait pas le sous-chemin.
                    redirectURI: oidcEnv('REDIRECT_URI'),
                    scopes: ['openid', 'profile', 'email', 'groups', 'federated:id'],
                    mapProfileToUser(profile) {
                        const roleAnnuaire = roleDesGroupes(profile.groups)
                        // Le rôle est mémorisé ici ET renvoyé ci-dessous : renvoyé, il sert aux
                        // versions qui l'honorent ; mémorisé, il survit au filtre des versions
                        // récentes.
                        if (roleAnnuaire) memoriserRole(profile.email, roleAnnuaire)
                        // RÉVOCATION. `mapProfileToUser` est appelé à CHAQUE connexion, pas
                        // seulement à la création : c'est ici que le retrait du groupe `admins`
                        // se propage.
                        void alignerRoleSurAnnuaire(profile.email, roleAnnuaire)
                        // Avatar tiré de Nextcloud, à partir de l'identifiant fédéré. La
                        // concaténation directe produisait « undefined/avatar/… » quand
                        // l'URL du service d'avatars n'était pas renseignée : une URL invalide ENREGISTRÉE
                        // sur le compte, donc une image cassée à chaque affichage — et le repli
                        // sur les initiales ne jouait pas, le…
                        const nc = oidcEnv('NC_URL')?.replace(/\/+$/, '')
                        const federe = profile.federated_claims?.user_id
                        return {
                            email: profile.email,
                            role: roleDesGroupes(profile.groups),
                            image: nc && federe ? `${nc}/avatar/${federe}/512` : undefined,
                        }
                    },
                }
            ] : []
        }),
        admin()
    ],
    // Réapplique le rôle issu de l'annuaire, que la création OAuth a filtré (voir plus haut).
    databaseHooks: {
        user: {
            create: {
                async before(utilisateur: { email?: string }) {
                    const role = consommerRole(utilisateur.email)
                    // Sans rôle mémorisé (inscription par mot de passe, compte de secours),
                    // on ne touche à rien : la valeur du greffon `admin` s'applique.
                    return role ? { data: { ...utilisateur, role } } : undefined
                },
            },
        },
    },
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") || [],
})

export { auth }
