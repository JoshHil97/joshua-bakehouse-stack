// src/api/auth.js
const API_BASE = import.meta.env.VITE_API_BASE_URL

// Send an API request via gateway to our lambda to post to the dynamo table with our email and password
export async function signUp(email, password) {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || "Sign up failed")
  return data.user // { email }
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || "Login failed")
  return data.user // { email }
}
