import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/healthcheck', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    })
  })

  await page.route('**/api/products', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        products: ['cinnamon_bun', 'sourdough_loaf']
      })
    })
  })

  await page.route('**/api/favourites**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          favourites: [{ email: 'baker@example.com', productId: 'sourdough_loaf' }]
        })
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      status: 201,
      body: JSON.stringify({ status: 'favourited' })
    })
  })
})

test('home route renders and checks backend status', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /welcome to the bakehouse/i })).toBeVisible()
  await expect(page.getByText(/backend/i)).toBeVisible()
})

test('logged-in user can view products and toggle favourites', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bakehouseUser', JSON.stringify({ email: 'baker@example.com' }))
  })

  await page.goto('/products')

  await expect(page.getByText('Cinnamon Bun')).toBeVisible()
  await expect(page.getByText('Sourdough Loaf')).toBeVisible()

  const sourdoughButton = page
    .locator('div')
    .filter({ hasText: 'Sourdough Loaf' })
    .getByRole('button', { name: 'Liked' })

  await expect(sourdoughButton).toHaveAttribute('aria-pressed', 'true')
  await sourdoughButton.click()
  await expect(page.getByRole('button', { name: 'Like' }).first()).toBeVisible()
})
