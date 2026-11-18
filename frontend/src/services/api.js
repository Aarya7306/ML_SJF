const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    })
  } catch {
    throw new Error(`Backend unavailable. Start it with: python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000`)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

export const api = {
  health: () => request('/health'),
  summary: () => request('/dataset/summary'),
  metrics: () => request('/ml/metrics'),
  analysis: () => request('/ml/analysis'),
  predict: (body) => request('/ml/predict', { method: 'POST', body: JSON.stringify(body) }),
  train: (body = {}) => request('/ml/train', { method: 'POST', body: JSON.stringify(body) }),
  compare: (body) => request('/simulation/compare', { method: 'POST', body: JSON.stringify(body) }),
  run: (body) => request('/simulation/run', { method: 'POST', body: JSON.stringify(body) }),
  adaptive: () => request('/adaptive/status'),
  retrain: () => request('/adaptive/retrain', { method: 'POST' }),
  feedback: (body) => request('/adaptive/feedback', { method: 'POST', body: JSON.stringify(body) }),
  batchFeedback: (body) => request('/adaptive/feedback/batch', { method: 'POST', body: JSON.stringify(body) })
}
