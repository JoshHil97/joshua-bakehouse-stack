import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750']
  }
}

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:5173'

export default function () {
  const health = http.get(`${baseUrl}/api/healthcheck`)
  check(health, {
    'healthcheck is ok': (res) => res.status === 200
  })

  const products = http.get(`${baseUrl}/api/products`)
  check(products, {
    'products is ok': (res) => res.status === 200,
    'products has body': (res) => res.body && res.body.length > 0
  })

  sleep(1)
}
