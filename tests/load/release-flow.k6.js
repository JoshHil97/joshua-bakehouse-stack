import http from 'k6/http'
import { check, group, sleep } from 'k6'

export const options = {
  scenarios: {
    release_flow: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 4 },
        { duration: '1m', target: 4 },
        { duration: '30s', target: 0 }
      ],
      gracefulRampDown: '10s',
      exec: 'releaseFlow'
    },
    cloudwatch_alarm_demo: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 6,
      startTime: '20s',
      exec: 'alarmDemo'
    }
  },
  thresholds: {
    'http_req_duration{endpoint:healthcheck}': ['p(95)<1000'],
    'http_req_duration{endpoint:products}': ['p(95)<1500'],
    'http_req_duration{endpoint:customers}': ['p(95)<1500'],
    'http_req_duration{endpoint:orders}': ['p(95)<1500'],
    checks: ['rate>0.95']
  }
}

const baseUrl = __ENV.BASE_URL || 'https://joshua-hilarion-bakehouse.cta-training.academy'

export function releaseFlow () {
  group('public api journey', () => {
    const health = http.get(`${baseUrl}/api/healthcheck`, {
      tags: { endpoint: 'healthcheck' }
    })
    check(health, {
      'healthcheck is 200': (res) => res.status === 200
    })

    const products = http.get(`${baseUrl}/api/products`, {
      tags: { endpoint: 'products' }
    })
    check(products, {
      'products is 200': (res) => res.status === 200,
      'products includes cinnamon bun': (res) => res.body.includes('cinnamon_bun')
    })

    const customers = http.get(`${baseUrl}/api/customers`, {
      tags: { endpoint: 'customers' }
    })
    check(customers, {
      'customers is 200': (res) => res.status === 200
    })

    const orders = http.get(`${baseUrl}/api/orders`, {
      tags: { endpoint: 'orders' }
    })
    check(orders, {
      'orders is 200': (res) => res.status === 200
    })
  })

  sleep(1)
}

export function alarmDemo () {
  const bad = http.get(`${baseUrl}/api/bad`, {
    tags: { endpoint: 'bad-alarm-demo' }
  })
  check(bad, {
    'bad endpoint creates expected 500': (res) => res.status === 500
  })

  sleep(1)
}
