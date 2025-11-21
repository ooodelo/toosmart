const API_BASE = window.__CONFIG__?.API_BASE || import.meta.env.VITE_API_BASE || "";
export async function createOrder(email, amount) {
  const r = await fetch(`${API_BASE}/api/order/create`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email, amount, product_code: undefined })
  });
  return r.json();
}
export async function magicConsume(token) {
  const r = await fetch(`${API_BASE}/api/auth/magic-consume`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ token })
  });
  return r.json();
}
export async function setPassword(password) {
  const r = await fetch(`${API_BASE}/api/auth/set-password`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ password })
  });
  return r.json();
}
export async function login(email, password) {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email, password })
  });
  return r.json();
}
