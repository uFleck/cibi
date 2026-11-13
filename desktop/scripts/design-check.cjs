// Design smoke check for the running desktop app.
//
// The app must be running with the WebView2 remote debugger enabled:
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
//   npm run tauri dev
//
// Then, from desktop/: npm run design:check
// It checks for horizontal overflow at two window sizes and writes screenshots to docs/design/validation.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const CDP = process.env.CIBI_CDP_URL ?? 'http://localhost:9222'
const APP = process.env.CIBI_APP_URL ?? 'http://localhost:5173'
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'design', 'validation')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function overflowAt(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(400)
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    const offenders = [...main.querySelectorAll('*')]
      .map(el => {
        const rect = el.getBoundingClientRect()
        return { tag: el.tagName, cls: String(el.className).slice(0, 60), right: rect.right, width: rect.width }
      })
      .filter(item => item.width > 0 && item.right > window.innerWidth + 1)
      .slice(0, 10)
    const controls = document.querySelector('.fixed.top-0.right-0')
    const theme = document.querySelector('header [aria-label*="tema"]')
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      offenders,
      controlsLeft: controls?.getBoundingClientRect().left ?? null,
      themeRight: theme?.getBoundingClientRect().right ?? null,
    }
  })
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP)
  const pages = browser.contexts().flatMap(context => context.pages())
  const page = pages.find(candidate => candidate.url().includes(new URL(APP).host)) ?? pages[0]
  assert(page, 'no webview page found; is the app running with remote debugging?')

  fs.mkdirSync(OUT, { recursive: true })
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const routes = [
    ['01-plano', '/'],
    ['02-extrato', '/extrato'],
    ['03-amigos', '/amigos'],
    ['04-ajustes', '/ajustes'],
  ]

  for (const [name, route] of routes) {
    await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    const overflow = await overflowAt(page, 1100, 800)
    assert(overflow.docScrollWidth <= overflow.innerWidth, `${name}: horizontal overflow at 1100px`)
    assert(overflow.offenders.length === 0, `${name}: elements past the viewport: ${JSON.stringify(overflow.offenders)}`)
    if (overflow.controlsLeft !== null && overflow.themeRight !== null) {
      assert(overflow.themeRight <= overflow.controlsLeft - 4, `${name}: the header overlaps the window controls`)
    }
    const text = await page.locator('body').innerText()
    assert(text.includes('Plano') && text.includes('Extrato'), `${name}: navigation is missing`)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    console.log(`ok ${name} at 1100x800`)
  }

  for (const [name, route] of [['08-plano-estreito', '/'], ['09-ajustes-estreito', '/ajustes']]) {
    await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    const overflow = await overflowAt(page, 820, 700)
    assert(overflow.docScrollWidth <= overflow.innerWidth, `${name}: horizontal overflow at 820px`)
    assert(overflow.offenders.length === 0, `${name}: elements past the viewport: ${JSON.stringify(overflow.offenders)}`)
    if (overflow.controlsLeft !== null && overflow.themeRight !== null) {
      assert(overflow.themeRight <= overflow.controlsLeft - 4, `${name}: the header overlaps the window controls`)
    }
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
    console.log(`ok ${name} at 820x700`)
  }

  await page.goto(`${APP}/amigos`, { waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Abrir Lava e Seca' }).click()
  await page.waitForTimeout(300)
  const detalhe = await page.locator('body').innerText()
  assert(/parcelas/i.test(detalhe), 'amigos: the debt detail is missing the installments')
  assert(/histórico/i.test(detalhe), 'amigos: the debt detail is missing the history')
  const detailOverflow = await overflowAt(page, 1100, 800)
  assert(detailOverflow.docScrollWidth <= detailOverflow.innerWidth, 'amigos: detail overflows at 1100px')
  assert(detailOverflow.offenders.length === 0, `amigos: detail elements past the viewport: ${JSON.stringify(detailOverflow.offenders)}`)
  await page.screenshot({ path: path.join(OUT, '05-amigos-detalhe.png'), fullPage: true })
  console.log('ok 05-amigos-detalhe at 1100x800')

  const narrowDetail = await overflowAt(page, 820, 700)
  assert(narrowDetail.docScrollWidth <= narrowDetail.innerWidth, 'amigos: detail overflows at 820px')
  assert(narrowDetail.offenders.length === 0, `amigos: narrow detail elements past the viewport: ${JSON.stringify(narrowDetail.offenders)}`)
  await page.screenshot({ path: path.join(OUT, '07-amigos-detalhe-estreito.png'), fullPage: true })
  console.log('ok 07-amigos-detalhe-estreito at 820x700')
  await page.setViewportSize({ width: 1100, height: 800 })

  await page.getByRole('button', { name: 'Editar Lava e Seca' }).click()
  await page.waitForTimeout(300)
  const editar = await page.locator('body').innerText()
  assert(/próximo vencimento/i.test(editar), 'amigos: the edit form is missing the next due date')
  assert(/parcelas no total/i.test(editar), 'amigos: the edit form is missing the installment count')
  const editOverflow = await overflowAt(page, 1100, 800)
  assert(editOverflow.docScrollWidth <= editOverflow.innerWidth, 'amigos: edit overflows at 1100px')
  assert(editOverflow.offenders.length === 0, `amigos: edit elements past the viewport: ${JSON.stringify(editOverflow.offenders)}`)
  await page.screenshot({ path: path.join(OUT, '06-amigos-editar.png'), fullPage: true })
  console.log('ok 06-amigos-editar at 1100x800')

  const narrowEdit = await overflowAt(page, 820, 700)
  assert(narrowEdit.docScrollWidth <= narrowEdit.innerWidth, 'amigos: edit overflows at 820px')
  assert(narrowEdit.offenders.length === 0, `amigos: narrow edit elements past the viewport: ${JSON.stringify(narrowEdit.offenders)}`)
  await page.screenshot({ path: path.join(OUT, '10-amigos-editar-estreito.png'), fullPage: true })
  console.log('ok 10-amigos-editar-estreito at 820x700')
  await page.keyboard.press('Escape')

  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 1100, height: 800 })
  console.log(`screenshots in ${OUT}`)
  await browser.close()
}

main().catch(error => {
  console.error(`design check failed: ${error.message}`)
  process.exit(1)
})
