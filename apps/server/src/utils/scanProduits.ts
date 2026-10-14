// LES PRODUITS RECONNUS PAR LE SCAN — signatures déclarées, jamais codées en dur ailleurs.

export type Categorie = 'cms' | 'wiki' | 'messagerie' | 'sso' | 'cloud' | 'boutique' | 'collaboratif' | 'autre'

export type Indice =
  | { ou: 'meta', champ: 'generator' | 'description', motif: RegExp }
  | { ou: 'entete', nom: string, motif: RegExp }
  /** Sur le corps DÉBARRASSÉ de ses liens sortants : un lien ailleurs ne prouve rien ici. */
  | { ou: 'corps', motif: RegExp }

export type Sonde = {
  chemin: string
  /** Extrait la version du corps de la sonde. `null` quand elle n'y est pas. */
  version: (texte: string) => string | null
  /** La sonde CONFIRME-t-elle le produit à elle seule ? `/status.php` de Nextcloud, oui. */
  confirme?: (texte: string) => boolean
  /**
   * Interroger même si le produit n'a PAS été repéré sur la page. Réservé aux points d\'entrée
   * qui ne mentent pas et ne coûtent rien : Nextcloud derrière un portail de connexion
   * n'annonce rien, mais `/status.php` répond toujours.
   */
  toujours?: boolean
}

export type Produit = {
  produit: string
  categorie: Categorie
  /** Les produits d'une même famille s\'excluent : le premier reconnu gagne. */
  famille?: string
  certains: Indice[]
  probables?: Indice[]
  /** Motifs de version, cherchés sur le corps BRUT. Le premier qui capture gagne. */
  version?: RegExp[]
  /**
   * VERSION LUE DANS L'URL D\'UN ACTIF DU CŒUR — `?ver=6.4.3`. Le gisement le plus large, et il
   * ne coûte aucune requête : les CMS versionnent leurs fichiers pour casser les caches des
   * navigateurs, ce qui publie la version même quand la balise `generator` a été retirée.
   */
  versionActif?: RegExp[]
  sondes?: Sonde[]
}

const json = (texte: string, champ: string): string | null => {
  try {
    const d = JSON.parse(texte) as Record<string, unknown>
    const v = d[champ]
    return typeof v === 'string' && v ? v : null
  }
  catch { return null }
}

/**
 * L'ordre COMPTE pour les familles. Ailleurs il est indifférent : un site peut porter nginx,
 * PHP et WordPress à la fois, et les trois sont vrais.
 */
export const PRODUITS: Produit[] = [
  // --- Messagerie ---------------------------------------------------------------------
  {
    produit: 'Carbonio', categorie: 'messagerie', famille: 'messagerie-zimbra',
    certains: [
      { ou: 'meta', champ: 'description', motif: /carbonio/i },
      { ou: 'meta', champ: 'generator', motif: /carbonio/i },
    ],
    probables: [{ ou: 'corps', motif: /carbonio/i }],
    version: [/Carbonio[^\d]{0,15}([\d.]+)/i],
  },
  {
    produit: 'Zimbra', categorie: 'messagerie', famille: 'messagerie-zimbra',
    certains: [
      { ou: 'meta', champ: 'description', motif: /zimbra/i },
      { ou: 'meta', champ: 'generator', motif: /zimbra/i },
      { ou: 'entete', nom: 'server', motif: /zimbra/i },
    ],
    probables: [{ ou: 'corps', motif: /zimbra collaboration suite|"zimbraversion"/i }],
    // La version est souvent masquée sur le portail de connexion : ce n'est pas un défaut.
    version: [/Zimbra Collaboration Suite[^\d]*([\d.]+)/i, /"zimbraVersion"\s*:\s*"([\d.]+)"/],
  },
  {
    produit: 'Roundcube', categorie: 'messagerie',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /roundcube/i },
      { ou: 'entete', nom: 'set-cookie', motif: /roundcube_sessid=/i },
    ],
    probables: [{ ou: 'corps', motif: /roundcube/i }],
    version: [/Roundcube Webmail\s+([\d.]+)/i],
  },
  {
    produit: 'SOGo', categorie: 'messagerie',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /sogo/i },
      { ou: 'entete', nom: 'server', motif: /sogo/i },
    ],
    version: [/SOGo[^\d]{0,10}([\d.]+)/i],
  },

  // --- Portail et nuage ---------------------------------------------------------------
  {
    produit: 'LemonLDAP::NG', categorie: 'sso',
    certains: [
      { ou: 'meta', champ: 'description', motif: /lemonldap/i },
      { ou: 'meta', champ: 'generator', motif: /lemonldap/i },
      // Le cookie de session porte le nom par défaut du produit.
      { ou: 'entete', nom: 'set-cookie', motif: /\blemonldap=/i },
    ],
    // `trOver` est une fonction du thème par défaut : distinctive sans être déclarative.
    probables: [{ ou: 'corps', motif: /trOver|lemonldap(::ng)?/i }],
    version: [/LemonLDAP::NG\s*([\d.]+)/i],
  },
  {
    produit: 'Nextcloud', categorie: 'cloud',
    certains: [{ ou: 'meta', champ: 'generator', motif: /nextcloud/i }],
    sondes: [{
      // Point d'entrée officiel : une auto-déclaration, aussi fiable qu'une balise meta.
      chemin: '/status.php',
      toujours: true,
      confirme: t => /"productname"\s*:\s*"nextcloud"/i.test(t) || /"versionstring"/i.test(t),
      version: t => json(t, 'versionstring') ?? json(t, 'version'),
    }],
  },

  // --- Wikis --------------------------------------------------------------------------
  {
    produit: 'MediaWiki', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /mediawiki/i }],
    probables: [{ ou: 'corps', motif: /id="footer-poweredbymediawiki"|powered by mediawiki|class="[^"]*\bmediawiki\b|mw-body/i }],
    version: [/MediaWiki\s*([\d.]+)/i],
    versionActif: [/"wgVersion"\s*:\s*"([\d.]+)"/i],
    sondes: [{
      chemin: '/api.php?action=query&meta=siteinfo&format=json',
      confirme: t => /"generator"\s*:\s*"MediaWiki/i.test(t),
      version: t => t.match(/"generator"\s*:\s*"MediaWiki\s+([\d.]+)/i)?.[1] ?? null,
    }],
  },
  {
    produit: 'DokuWiki', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /dokuwiki/i }],
    probables: [{ ou: 'corps', motif: /doku\.php|dokuwiki|\/lib\/exe\//i }],
    // `comparerVersions` sait les ordonner.
    version: [/DokuWiki\s*(?:Release\s*)?(\d{4}-\d{2}-\d{2}[a-z]?)/i],
    sondes: [{
      chemin: '/VERSION',
      confirme: t => /^\s*\d{4}-\d{2}-\d{2}/.test(t) && t.length < 200,
      version: t => t.trim().match(/^(\d{4}-\d{2}-\d{2}[a-z]?)/)?.[1] ?? null,
    }],
  },
  {
    produit: 'Wiki.js', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /wiki\.js/i }],
    version: [/Wiki\.js\s*v?([\d.]+)/i],
  },
  {
    produit: 'Tiki Wiki', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /tiki/i }],
    probables: [{ ou: 'corps', motif: /tikiwiki/i }],
    version: [/Tiki Wiki CMS Groupware\s*([\d.]+)/i],
  },
  {
    produit: 'XWiki', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /xwiki/i }],
    probables: [{ ou: 'corps', motif: /xwiki/i }],
    version: [/XWiki\s*([\d.]+)/i],
  },
  {
    produit: 'Confluence', categorie: 'collaboratif',
    certains: [{ ou: 'meta', champ: 'generator', motif: /atlassian confluence/i }],
    version: [/Confluence\s*([\d.]+)/i],
  },
  {
    produit: 'BookStack', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /bookstack/i }],
    probables: [{ ou: 'corps', motif: /powered by bookstack/i }],
    version: [/BookStack\s*v?([\d.]+)/i],
  },
  {
    produit: 'MoinMoin', categorie: 'wiki',
    certains: [{ ou: 'meta', champ: 'generator', motif: /moinmoin/i }],
    probables: [{ ou: 'corps', motif: /moinmoin/i }],
    version: [/MoinMoin\s*([\d.]+)/i],
  },

  // --- CMS ----------------------------------------------------------------------------
  {
    produit: 'WordPress', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /wordpress/i }],
    probables: [{ ou: 'corps', motif: /wp-content|wp-includes|wp-json/i }],
    version: [/WordPress\s*([\d.]+)/i],
    versionActif: [/\/wp-includes\/[^"'\s]+\?[^"'\s]*\bver=(\d+\.\d+(?:\.\d+)?)/i],
    sondes: [
      {
        chemin: '/wp-json/',
        confirme: t => /"namespace"\s*:\s*"wp\/v2"/i.test(t),
        version: t => (json(t, 'generator') ?? json(t, 'description') ?? '').match(/WordPress[/\s]*([\d.]+)/i)?.[1] ?? null,
      },
      {
        chemin: '/readme.html',
        confirme: t => /wordpress/i.test(t),
        version: t => t.match(/Version\s+([\d.]+)/)?.[1] ?? null,
      },
    ],
  },
  {
    produit: 'Joomla', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /joomla/i }],
    probables: [{ ou: 'corps', motif: /\/media\/jui\/|joomla/i }],
    version: [/Joomla!?\s*-?\s*([\d.]+)/i],
    versionActif: [/\/media\/(?:system|vendor)\/[^"'\s]+\?[^"'\s]*\b(?:ver|version)=(\d+\.\d+(?:\.\d+)?)/i],
    sondes: [
      {
        chemin: '/administrator/manifests/files/joomla.xml',
        confirme: t => /<name>files_joomla<\/name>/i.test(t),
        version: t => t.match(/<version>([\d.]+)<\/version>/i)?.[1] ?? null,
      },
      {
        // Joomla 3 : le manifeste de langue porte la version du noyau, hors
        // /administrator/ — donc lisible là où le premier est interdit.
        chemin: '/language/en-GB/en-GB.xml',
        confirme: t => /<name>English/i.test(t) || /joomla/i.test(t),
        version: t => t.match(/<version>([\d.]+)<\/version>/i)?.[1] ?? null,
      },
    ],
  },
  {
    produit: 'Drupal', categorie: 'cms',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /drupal/i },
      { ou: 'entete', nom: 'x-generator', motif: /drupal/i },
      // En-têtes de cache propres à Drupal : leur seule présence nomme le produit.
      { ou: 'entete', nom: 'x-drupal-cache', motif: /.+/ },
      { ou: 'entete', nom: 'x-drupal-dynamic-cache', motif: /.+/ },
    ],
    probables: [{ ou: 'corps', motif: /\/sites\/(default|all)\/(files|modules|themes)\/|drupal\.js/i }],
    version: [/Drupal\s*([\d.]+)/i],
    versionActif: [/\/core\/(?:misc|modules|themes)\/[^"'\s]+\?[^"'\s]*\bv=(\d+\.\d+(?:\.\d+)?)/i],
    sondes: [{
      chemin: '/CHANGELOG.txt',
      confirme: t => /drupal/i.test(t.slice(0, 400)),
      version: t => t.match(/Drupal\s+([\d.]+),/i)?.[1] ?? null,
    }],
  },
  {
    produit: 'TYPO3', categorie: 'cms',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /typo3/i },
      { ou: 'entete', nom: 'set-cookie', motif: /fe_typo_user=/i },
    ],
    probables: [{ ou: 'corps', motif: /typo3(conf|temp)/i }],
    version: [/TYPO3\s*(?:CMS\s*)?([\d.]+)/i],
    versionActif: [/\/typo3\/sysext\/[^"'\s]+\?[^"'\s]*\b(?:ver|v)=(\d+\.\d+(?:\.\d+)?)/i],
  },
  {
    produit: 'SPIP', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /spip/i }],
    probables: [{ ou: 'corps', motif: /spip\.php/i }],
    version: [/SPIP\s*([\d.]+)/i],
    versionActif: [/\/(?:prive|squelettes-dist)\/[^"'\s]+\?[^"'\s]*\bv=(\d+\.\d+(?:\.\d+)?)/i],
  },
  {
    produit: 'Dotclear', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /dotclear/i }],
    probables: [{ ou: 'corps', motif: /dotclear/i }],
    version: [/Dotclear\s*([\d.]+)/i],
  },
  {
    produit: 'Ghost', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /ghost/i }],
    version: [/Ghost\s*([\d.]+)/i],
  },
  {
    produit: 'Moodle', categorie: 'cms',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /moodle/i },
      { ou: 'entete', nom: 'set-cookie', motif: /MoodleSession/i },
    ],
    probables: [{ ou: 'corps', motif: /moodle/i }],
    version: [/Moodle\s+(\d+\.\d+(?:\.\d+)?)/i],
    sondes: [{
      // Journal de mise à jour du noyau, public sur toute installation. Sa première
      // section porte la version courante.
      chemin: '/lib/upgrade.txt',
      confirme: t => /moodle/i.test(t.slice(0, 400)),
      version: t => t.match(/^===\s*(\d+\.\d+(?:\.\d+)?)[^=]*===/m)?.[1] ?? null,
    }],
  },

  // --- Boutiques et hébergés ----------------------------------------------------------
  {
    produit: 'PrestaShop', categorie: 'boutique',
    certains: [
      { ou: 'meta', champ: 'generator', motif: /prestashop/i },
      { ou: 'entete', nom: 'set-cookie', motif: /PrestaShop-/i },
    ],
    probables: [{ ou: 'corps', motif: /prestashop/i }],
    version: [/PrestaShop[^\d]{0,10}([\d.]+)/i],
  },
  {
    produit: 'Magento', categorie: 'boutique',
    certains: [{ ou: 'meta', champ: 'generator', motif: /magento/i }],
    // `text/x-magento-init` et `data-mage-init` sont le chargeur de composants de Magento 2 :
    // présents sur toute page du front, et le produit n'a aucune raison de les masquer.
    probables: [{ ou: 'corps', motif: /Mage\.Cookies|magento|Magento_|text\/x-magento-init|data-mage-init/i }],
    sondes: [{
      // Point d'entrée publié par Magento 2 : « Magento/2.4 (Community) ». Il ne donne que la
      // branche, jamais le correctif — assez pour la fin de support, pas pour le retard de
      // correctif.
      chemin: '/magento_version',
      confirme: t => /^Magento\/\d/.test(t.trim()),
      version: t => t.trim().match(/^Magento\/(\d+\.\d+)/)?.[1] ?? null,
    }],
  },
  {
    produit: 'Shopify', categorie: 'boutique',
    certains: [{ ou: 'meta', champ: 'generator', motif: /shopify/i }],
    probables: [{ ou: 'corps', motif: /Shopify\.theme/i }],
  },
  {
    produit: 'Wix', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /wix\.com|wix/i }],
    probables: [{ ou: 'corps', motif: /wixBiSession/i }],
  },
  {
    produit: 'Squarespace', categorie: 'cms',
    certains: [{ ou: 'meta', champ: 'generator', motif: /squarespace/i }],
  },

]

/** Le contenu d'une balise `<meta name="…" content="…">`, dans les deux ordres d\'attributs. */
export function meta(corps: string, champ: string): string | null {
  const a = corps.match(new RegExp(`<meta[^>]+name=["']${champ}["'][^>]+content=["']([^"']*)["']`, 'i'))
  if (a?.[1]) return a[1].trim()
  const b = corps.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${champ}["']`, 'i'))
  return b?.[1]?.trim() || null
}
