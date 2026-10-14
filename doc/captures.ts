/**
 * Génère les captures d'écran du guide utilisateur. bun doc/captures.ts [url] (défaut :
 * http://localhost:8080) Deux règles de conception : 1.
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:8080'
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@catalogue.local'
const MOTDEPASSE = process.env.SEED_ADMIN_PASSWORD ?? 'catalogue123'
const DEST = join(import.meta.dir, 'images')
mkdirSync(DEST, { recursive: true })

const capturer = async (page: Page, nom: string, selecteur?: string) => {
  const cible = selecteur ? page.locator(selecteur).first() : page
  // Une capture d'un élément vide ou minuscule est presque toujours un sélecteur qui a attrapé
  // le mauvais nœud (l'en-tête de la barre latérale au lieu de celui de la page, typiquement).
  if (selecteur) {
    const boite = await cible.boundingBox().catch(() => null)
    if (!boite || boite.width < 200 || boite.height < 40) {
      console.log(`  ⚠️  ${nom} — élément trop petit (${boite?.width ?? 0}×${boite?.height ?? 0}), sélecteur à revoir`)
      return
    }
  }
  try {
    await cible.screenshot({ path: join(DEST, `${nom}.png`) })
    console.log(`  ✅ ${nom}.png`)
  }
  catch (e) {
    console.log(`  ⚠️  ${nom} — ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  }
}

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
const page = await contexte.newPage()

// --- Connexion ------------------------------------------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
// Le formulaire seul : capturer `main` produisait une image de 2,5 Mo pour un
// contenu de quelques centaines de pixels utiles.
await capturer(page, '01-connexion', 'form')
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', MOTDEPASSE)
await page.click('button[type=submit]')
await page.waitForURL(u => !u.pathname.includes('login'), { timeout: 15000 })
await page.waitForLoadState('networkidle')

// --- Navigation : le menu, sans le contenu des pages ------------------------------------
await capturer(page, '02-menu', 'aside, nav')

// --- Une liste : la barre de recherche et de filtres -------------------------------------
await page.goto(`${BASE}/applications`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await capturer(page, '03-liste-entete', 'main header')
await capturer(page, '04-filtres', 'main header + *')

// --- Bascule cartes / tableau et sélecteur de colonnes ----------------------------------
// On passe par une liste PEUPLÉE (les technologies : des noms de produits, pas des
// machines nommées) pour que les commandes soient dans leur état réel.
await page.goto(`${BASE}/technologies`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const tableau = page.locator('button[title*="Tableau"]').first()
if (await tableau.count()) {
  await capturer(page, '05-bascule-vue', 'main header')
  await tableau.click()
  await page.waitForTimeout(800)
  const colonnes = page.locator('button:has-text("Colonnes")').first()
  if (await colonnes.count()) {
    await colonnes.click()
    await page.waitForTimeout(500)
    await capturer(page, '06-choix-colonnes', 'div.absolute.right-0')
    // Le panneau se referme en cliquant hors de lui : son voile invisible couvre la page
    // et intercepterait les clics suivants (les cases à cocher, notamment).
    await page.locator('div.fixed.inset-0.z-40').click({ force: true })
    await page.waitForTimeout(400)
  }
}

// --- Sélection multiple et barre d'actions groupées -------------------------------------
const cases = page.locator('tbody input[type=checkbox]')
if (await cases.count() > 2) {
  for (let i = 0; i < 3; i++) await cases.nth(i).check()
  await page.waitForTimeout(500)
  await capturer(page, '10-actions-groupees', 'div.sticky.bottom-3')

  // Confirmation proportionnée : elle annonce l'ampleur et cite des exemples.
  const supprimer = page.locator('button:has-text("Supprimer")').first()
  if (await supprimer.count()) {
    await supprimer.click()
    await page.waitForTimeout(400)
    await capturer(page, '11-confirmation', 'div.sticky.bottom-3')
    const renoncer = page.locator('button:has-text("Renoncer")').first()
    if (await renoncer.count()) await renoncer.click()
  }
}

// --- Une liste en cartes -----------------------------------------------------------------
// Sur un catalogue de tiers, alimenté de données FICTIVES pour la documentation : les
// noms réels de prestataires n'ont pas à circuler dans un guide.
await page.goto(`${BASE}/tiers`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await capturer(page, '12-liste-cartes', 'main section.grid')

// --- État vide : les actions proposées plutôt que le constat ----------------------------
await page.goto(`${BASE}/opportunites`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await capturer(page, '07-etat-vide', 'section')

// --- Référentiels : source, volumétrie attendue, écart ----------------------------------
await page.goto(`${BASE}/referentiels`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await capturer(page, '08-referentiels', 'section')

// --- Fin de vie : la légende des statuts ------------------------------------------------
await page.goto(`${BASE}/fin-de-vie`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await capturer(page, '09-fin-de-vie-actions', 'main header')

console.log(`\nCaptures écrites dans ${DEST}`)
await navigateur.close()
