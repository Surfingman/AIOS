import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`orb and windows at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/os/')
    await page.waitForFunction(() => !!sessionStorage.getItem('guardian-token'))
    await page.evaluate(() => document.fonts.ready)
    const pixels = async () => page.locator('canvas').evaluate(source => {
      const target = document.createElement('canvas')
      target.width = source.width; target.height = source.height
      const context = target.getContext('2d')!
      context.drawImage(source, 0, 0)
      const data = context.getImageData(0, 0, target.width, target.height).data
      let visible = 0; let hash = 0
      for (let index = 0; index < data.length; index += 16) {
        if (data[index + 3]) visible++
        hash = (hash + data[index] * (index + 1)) % 1000000007
      }
      return { visible, hash }
    })
    await expect.poll(async () => (await pixels()).visible).toBeGreaterThan(1000)
    const initial = await pixels()
    await expect.poll(async () => (await pixels()).hash).not.toBe(initial.hash)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await page.locator('.orbit-app').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }))
    expect(bounds.every(rect => rect.left >= 0 && rect.right <= viewport.width)).toBe(true)
    for (let first = 0; first < bounds.length; first++) for (let second = first + 1; second < bounds.length; second++) {
      const left = bounds[first]; const right = bounds[second]
      expect(left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top).toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })
    const before = await page.locator('.orbit-app').first().getAttribute('style')
    const stage = await page.locator('.orb-stage').boundingBox()
    await page.mouse.move(stage!.x + stage!.width / 2, stage!.y + stage!.height / 2)
    await page.mouse.down(); await page.mouse.move(stage!.x + stage!.width / 2 + 60, stage!.y + stage!.height / 2); await page.mouse.up()
    await expect(page.locator('.orbit-app').first()).not.toHaveAttribute('style', before!)
    await page.getByRole('button', { name: '오늘 일정', exact: true }).click()
    const frame = page.frameLocator('iframe:not([hidden])')
    await expect(frame.locator('.sidebar')).toBeHidden()
    await frame.getByRole('textbox').fill('유지할 초안')
    expect(await page.evaluate(() => document.querySelector('iframe')!.contentWindow!.sessionStorage.getItem('guardian-token') === sessionStorage.getItem('guardian-token'))).toBe(true)
    await page.getByRole('button', { name: '창 최소화', exact: true }).click()
    await page.getByRole('button', { name: '일정과 작업 창 복원', exact: true }).click()
    await expect(frame.getByRole('textbox')).toHaveValue('유지할 초안')
    await page.getByRole('button', { name: '창 크기 전환' }).click()
    await expect(page.locator('.app-window')).toHaveClass(/maximized/)
    await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true })
    await page.getByRole('button', { name: '창 닫기', exact: true }).click()
    await page.getByRole('button', { name: '내 파일 열기', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('Local preview <script>not executable</script>') })
    await expect(page.locator('pre')).toHaveText('Local preview <script>not executable</script>')
    await page.getByRole('button', { name: '창 닫기', exact: true }).click()
    await page.getByRole('button', { name: '음성 입력', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '취소', exact: true }).click()
    await page.getByRole('textbox', { name: 'AIOS에게 요청' }).fill('내일 일정 준비')
    await page.getByRole('button', { name: '요청 보내기' }).click()
    await expect(page.locator('.reply-panel')).toContainText('내일 일정 준비')
    await page.getByRole('button', { name: '화면 가리기', exact: true }).click()
    await expect(page.locator('.lock-screen')).toBeVisible()
    await page.getByRole('button', { name: '작업 공간으로 돌아가기' }).click()
    await expect(page.getByRole('textbox', { name: 'AIOS에게 요청' })).toBeEmpty()
    await expect.poll(async () => (await pixels()).visible).toBeGreaterThan(1000)
  })
}