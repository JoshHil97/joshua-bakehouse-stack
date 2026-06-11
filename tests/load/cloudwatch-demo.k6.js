import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    steady_api_smoke: {
      executor: 'constant-vus',
      vus: 3,
      duration: '1m',
      exec: 'steadyApiSmoke'
    },
    alarm_demo_5xx: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 8,
      startTime: '10s',
      exec: 'alarmDemo5xx'
    }
  },
  thresholds: {
    'http_req_duration{endpoint:healthcheck}': ['p(95)<1000'],
    'http_req_duration{endpoint:products}': ['p(95)<1500'],
    checks: ['rate>0.90']
  }
}

const baseUrl = __ENV.BASE_URL || 'https://joshua-hilarion-bakehouse.cta-training.academy'

export function steadyApiSmoke () {
  const health = http.get(`${baseUrl}/api/healthcheck`, {
    tags: { endpoint: 'healthcheck' }
  })
  check(health, {
    'healthcheck returns 200': (res) => res.status === 200
  })

  const products = http.get(`${baseUrl}/api/products`, {
    tags: { endpoint: 'products' }
  })
  check(products, {
    'products returns 200': (res) => res.status === 200,
    'products has a response body': (res) => res.body && res.body.length > 0
  })

  sleep(1)
}

export function alarmDemo5xx () {
  const bad = http.get(`${baseUrl}/api/bad`, {
    tags: { endpoint: 'bad-alarm-demo' }
  })
  check(bad, {
    'bad endpoint returns expected 500': (res) => res.status === 500
  })

  sleep(1)
}
