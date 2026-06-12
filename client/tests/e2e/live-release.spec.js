import { expect, test } from '@playwright/test'

test.skip(process.env.LIVE_E2E !== 'true', 'Live release test only runs after GitHub deploy')

test('live bakehouse release journey has seeded data and working pages', async ({ page, request }) => {
  const health = await request.get('/api/healthcheck')
  expect(health.ok()).toBeTruthy()
  await expect(await health.json()).toMatchObject({ status: 'ok' })

  const productsResponse = await request.get('/api/products')
  expect(productsResponse.ok()).toBeTruthy()
  const products = await productsResponse.json()
  expect(products.products).toEqual(
    expect.arrayContaining(['cinnamon_bun', 'sourdough_loaf', 'chocolate_brownie'])
  )
  expect(products.productDetails.length).toBeGreaterThanOrEqual(10)

  const customersResponse = await request.get('/api/customers')
  expect(customersResponse.ok()).toBeTruthy()
  const customers = await customersResponse.json()
  expect(customers.customers.length).toBeGreaterThan(0)

  const ordersResponse = await request.get('/api/orders')
  expect(ordersResponse.ok()).toBeTruthy()
  const orders = await ordersResponse.json()
  expect(orders.orders.length).toBeGreaterThan(0)

  await page.addInitScript(() => {
    window.localStorage.setItem('bakehouseUser', JSON.stringify({ email: 'release.baker@example.com' }))
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /welcome to the bakehouse/i })).toBeVisible()

  await page.goto('/products')
  await expect(page.getByText('Cinnamon Bun')).toBeVisible()
  await expect(page.getByText('Chocolate Brownie')).toBeVisible()
  await expect(page.getByText('Sourdough Loaf')).toBeVisible()

  await page.goto('/customers')
  await expect(page.getByText(/all registered customers/i)).toBeVisible()
  await expect(page.locator('table')).toBeVisible()

  await page.goto('/orders')
  await expect(page.getByText(/all customer orders/i)).toBeVisible()
  await expect(page.locator('table')).toBeVisible()
})
