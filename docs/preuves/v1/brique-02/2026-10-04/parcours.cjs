// Parcours Chrome de la brique 2 (Playwright), contre le serveur réel sur http://127.0.0.1:4330, base neuve.
// OUT : dossier des captures ; SERVEUR : script « start | stop » qui lance ou arrête ce serveur ;
// PLAYWRIGHT : chemin du module playwright s'il n'est pas installé localement.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')
const { execSync } = require('child_process')
const fs = require('fs')

const BASE = 'http://127.0.0.1:4330'
const OUT = process.env.OUT
const results = []
const log = (ok, what) => { results.push({ ok, what }); console.log(ok ? 'OK  ' : 'ÉCHEC', what) }
const expect = (cond, what) => log(!!cond, what)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitServer(up) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (up && r.ok) return } catch { if (!up) return }
    await sleep(250)
  }
  throw new Error('serveur ' + (up ? 'absent' : 'toujours là'))
}
const api = async (path) => (await fetch(BASE + path)).json()

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const overflow = document.documentElement.scrollWidth > vw
    const small = []
    for (const el of document.querySelectorAll('a[href], button, input, [role="radio"], [role="switch"]')) {
      const b = el.getBoundingClientRect()
      const st = getComputedStyle(el)
      if (b.width === 0 || b.height === 0 || st.visibility === 'hidden') continue
      // Zone effective : le point à 22 px du centre, horizontalement et verticalement, touche-t-il encore l'élément ?
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2
      const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)) }
      const okH = b.height >= 44 || (hit(cx, cy - 21.5) && hit(cx, cy + 21.5))
      const okW = b.width >= 44 || (hit(cx - 21.5, cy) && hit(cx + 21.5, cy))
      if (!(okH && okW)) small.push(`${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}» ${Math.round(b.width)}×${Math.round(b.height)}`)
    }
    return { overflow, small }
  })
  expect(!r.overflow, `${label} : aucun défilement horizontal`)
  expect(r.small.length === 0, `${label} : cibles ≥ 44 px${r.small.length ? ' — ' + r.small.join(' ; ') : ''}`)
}

async function run(viewport, suffix, mobile) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  const shot = (name) => page.screenshot({ path: `${OUT}/${name}-${suffix}.jpg`, type: 'jpeg', quality: 82 })
  const avatarSel = mobile ? 'main button[aria-label^="Profil : "]' : 'aside button[aria-label^="Profil : "]'

  // 1. Aujourd'hui avec avatar
  await page.goto(BASE + '/')
  await page.locator(avatarSel).first().waitFor()
  const first = (await api('/api/profiles'))[0].name
  expect((await page.locator(avatarSel).first().getAttribute('aria-label')) === `Profil : ${first}`, `${suffix} : appareil neuf → premier profil du serveur (${first})`)
  await audit(page, `${suffix} Aujourd’hui`)
  await shot('aujourdhui')

  // 2. Feuille Profil, changement
  await page.locator(avatarSel).first().click()
  const sheet = page.getByRole('dialog', { name: 'Profil' })
  await sheet.waitFor()
  await sleep(600)
  expect(await sheet.getByText('Réglages').isVisible(), `${suffix} : feuille Profil avec ligne Réglages`)
  await audit(page, `${suffix} feuille Profil`)
  await shot('feuille-profil')
  await page.keyboard.press('Escape')
  expect(await sheet.count() === 0, `${suffix} : Échap ferme la feuille`)
  await page.locator(avatarSel).first().click()
  await sheet.getByRole('button', { name: 'Ophélie' }).click()
  await sheet.waitFor({ state: 'detached' })
  expect(await page.locator(avatarSel + '[aria-label="Profil : Ophélie"]').first().waitFor({ timeout: 2000 }).then(() => true, () => false), `${suffix} : profil changé pour Ophélie`)
  expect(await page.evaluate(() => localStorage.getItem('fitness.profile.v1')) === 'ophelie', `${suffix} : choix écrit dans fitness.profile.v1`)

  // 3. Rechargement
  await page.reload()
  await page.locator(avatarSel).first().waitFor()
  expect((await page.locator(avatarSel).first().getAttribute('aria-label')) === 'Profil : Ophélie', `${suffix} : profil conservé après rechargement`)
  await shot('aujourdhui-ophelie')

  // Valeur inconnue en stockage → premier profil
  await page.evaluate(() => localStorage.setItem('fitness.profile.v1', 'inconnu'))
  await page.reload()
  await page.locator(avatarSel).first().waitFor()
  expect((await page.locator(avatarSel).first().getAttribute('aria-label')) === `Profil : ${first}`, `${suffix} : valeur inconnue → premier profil`)
  await page.evaluate(() => localStorage.setItem('fitness.profile.v1', 'ophelie'))
  await page.reload()
  await page.locator(avatarSel).first().waitFor()

  // 4. Réglages : objectif
  await page.locator(avatarSel).first().click()
  await sheet.getByRole('button', { name: 'Réglages' }).click()
  await page.waitForURL(/#\/reglages$/)
  const input = page.getByRole('textbox', { name: 'Séances par semaine' })
  await input.waitFor()
  const before = (await api('/api/profiles/ophelie')).weekly_goal
  await audit(page, `${suffix} Réglages`)
  await shot('reglages')
  const plus = page.getByRole('button', { name: 'Augmenter : Séances par semaine' })
  let patch = page.waitForResponse((r) => r.request().method() === 'PATCH')
  await plus.click()
  await patch
  patch = page.waitForResponse((r) => r.request().method() === 'PATCH')
  await plus.click()
  await patch
  await page.reload()
  await input.waitFor()
  await page.waitForFunction(() => document.querySelector('input[aria-label="Séances par semaine"]')?.value)
  expect((await input.inputValue()) === String(before + 2) && (await api('/api/profiles/ophelie')).weekly_goal === before + 2,
    `${suffix} : objectif ${before} → ${before + 2}, conservé après rechargement`)

  // Saisie clavier hors limites : non envoyée, message sous la ligne
  let sent = false
  const onReq = (r) => { if (r.method() === 'PATCH') sent = true }
  page.on('request', onReq)
  await input.fill('20')
  await input.press('Enter')
  await sleep(300)
  expect(!sent && (await page.getByRole('alert').filter({ hasText: 'Entre 1 et 14' }).isVisible()), `${suffix} : saisie 20 refusée localement, rien d’envoyé`)
  await input.fill('4')
  patch = page.waitForResponse((r) => r.request().method() === 'PATCH')
  await input.press('Enter')
  await patch
  page.off('request', onReq)
  expect((await api('/api/profiles/ophelie')).weekly_goal === 4, `${suffix} : saisie clavier 4 enregistrée`)

  // Enregistrement refusé par le serveur : valeur restaurée, message sous la ligne
  await page.route('**/api/profiles/ophelie', (route) => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'Objectif hebdomadaire : nombre entier de 1 à 14' }) })
    : route.fallback())
  await plus.click()
  await page.getByRole('alert').filter({ hasText: 'Objectif hebdomadaire' }).waitFor()
  expect((await input.inputValue()) === '4', `${suffix} : refus du serveur → valeur 4 restaurée`)
  await audit(page, `${suffix} Réglages refus`)
  await shot('reglages-refus')
  await page.unroute('**/api/profiles/ophelie')

  // 5. Unité
  const was = (await api('/api/profiles/ophelie')).speed_unit
  const [target, label] = was === 'kmh' ? ['pace', 'min/km'] : ['kmh', 'km/h']
  patch = page.waitForResponse((r) => r.request().method() === 'PATCH')
  await page.getByRole('radio', { name: label }).click()
  await patch
  await page.reload()
  await page.getByRole('radio', { name: label }).waitFor()
  expect((await page.getByRole('radio', { name: label }).getAttribute('aria-checked')) === 'true' && (await api('/api/profiles/ophelie')).speed_unit === target,
    `${suffix} : unité ${label} conservée après rechargement`)
  expect(!(await page.getByRole('alert').count()), `${suffix} : message d’erreur effacé après rechargement`)
  await shot('reglages-unite')

  // Chargement lent des profils : rien avant 1 s
  await page.route('**/api/profiles', async (route) => { await sleep(2500); await route.fallback() })
  await page.goto(BASE + '/#/')
  await page.reload()
  await sleep(500)
  const early = await page.getByText('Connexion').count()
  await sleep(900)
  const later = await page.getByText('Connexion').count()
  expect(early === 0 && later === 1, `${suffix} : chargement lent, rien à 0,5 s puis indicateur à 1,4 s`)
  await page.locator(avatarSel).first().waitFor()
  expect(await page.getByText('Connexion').count() === 0, `${suffix} : indicateur retiré après lecture`)
  await page.unroute('**/api/profiles')

  // Lecture des profils refusée : bandeau
  await page.route('**/api/profiles', (route) => route.fulfill({ status: 500, body: 'x' }))
  await page.reload()
  await page.getByRole('alert').waitFor()
  expect(await page.getByRole('alert').getByText('Serveur du PC indisponible').isVisible(), `${suffix} : lecture refusée → bandeau`)
  expect(await page.locator(avatarSel).count() === 0, `${suffix} : sans profils lus, aucun avatar`)
  await sleep(400)
  await shot('profils-illisibles')
  await page.unroute('**/api/profiles')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await page.locator(avatarSel).first().waitFor()
  expect(await page.getByRole('alert').count() === 0, `${suffix} : Réessayer relit les profils et retire le bandeau`)

  // 6. Serveur coupé
  await page.goto(BASE + '/#/reglages')
  await input.waitFor()
  execSync(`${process.env.SERVEUR} stop`)
  await waitServer(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.getByRole('alert').getByText('Serveur du PC injoignable').waitFor()
  expect(await input.isDisabled() && await page.getByRole('button', { name: 'Augmenter : Séances par semaine' }).isDisabled()
    && await page.getByRole('radio', { name: 'km/h' }).isDisabled(), `${suffix} : serveur coupé → Réglages en lecture seule`)
  expect(await page.getByText(/Dossier de données/).isVisible(), `${suffix} : serveur coupé → informations conservées`)
  await sleep(400)
  await shot('reglages-serveur-coupe')
  await page.locator(avatarSel).first().click()
  await sheet.waitFor()
  await sleep(500)
  expect(await sheet.getByRole('button', { name: 'Arnaud' }).count() === 0 && await sheet.getByText('Arnaud').isVisible(),
    `${suffix} : serveur coupé → profils affichés sans changement possible`)
  await shot('feuille-serveur-coupe')
  await page.keyboard.press('Escape')
  const benign = (e) => /Failed to load resource|ERR_CONNECTION_REFUSED/.test(e)
  execSync(`${process.env.SERVEUR} start`)
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await page.getByRole('alert').waitFor({ state: 'detached' })
  expect(await input.isEnabled(), `${suffix} : serveur relancé → Réglages modifiables`)
  await page.reload()
  await page.locator(avatarSel).first().waitFor()
  expect((await page.locator(avatarSel).first().getAttribute('aria-label')) === 'Profil : Ophélie', `${suffix} : profil conservé après redémarrage du serveur et rechargement`)

  const real = errors.filter((e) => !benign(e))
  expect(real.length === 0, `${suffix} : aucune erreur console (hors ressources refusées pendant la coupure provoquée : ${errors.length - real.length})${real.length ? ' — ' + real.join(' | ') : ''}`)
  await browser.close()
}

;(async () => {
  try {
    await run({ width: 390, height: 844 }, '390', true)
    // Second appareil : choix indépendant du premier
    await run({ width: 1440, height: 900 }, '1440', false)
  } catch (e) {
    log(false, 'exception : ' + e.stack)
  }
  fs.writeFileSync(`${OUT}/resultats.json`, JSON.stringify(results, null, 2))
  process.exit(results.every((r) => r.ok) ? 0 : 1)
})()
