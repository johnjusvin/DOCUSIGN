const API_BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include'
  })
  
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  checkSession: () => request('/auth/session'),

  // Documents
  listDocuments: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/docs${query ? `?${query}` : ''}`)
  },
  getDocument: (id) => request(`/docs/${id}`),
  createDocument: (data) => request('/docs', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id, data) => request(`/docs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id) => request(`/docs/${id}?confirm=true`, { method: 'DELETE' }),
  uploadDocument: async (formData) => {
    try {
      const r = await fetch(`${API_BASE}/docs/upload`, { method: 'POST', body: formData, credentials: 'include' });
      return await r.json();
    } catch (e) {
      // Multipart POST blocked somewhere on the path — retry as base64 JSON,
      // which uses the same channel as every other (working) API call.
      const file = formData.get('file');
      if (!file || !(file instanceof Blob)) throw e;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(e);
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${API_BASE}/docs/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      return await r.json();
    }
  },
  updateDocument: (id, data) => request(`/docs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Requests (envelopes, authenticated)
  createRequest: (data) => request('/requests', { method: 'POST', body: JSON.stringify(data) }),
  listRequests: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/requests${query ? `?${query}` : ''}`)
  },
  getRequest: (id) => request(`/requests/${id}`),
  cancelRequest: (id) => request(`/requests/${id}/cancel`, { method: 'POST' }),

  // Public signer flow (token is the credential — no login required)
  getSignerSnapshot: (token) => request(`/sign/${encodeURIComponent(token)}`),
  signAsSigner: (token, values) => request(`/sign/${encodeURIComponent(token)}/sign`, { method: 'POST', body: JSON.stringify({ values }) }),
  declineAsSigner: (token, reason) => request(`/sign/${encodeURIComponent(token)}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  signerDocumentUrl: (token) => `${API_BASE}/sign/${encodeURIComponent(token)}/document`,

  // Templates
  listTemplates: () => request('/templates'),
  getTemplate: (id) => request(`/templates/${id}`),
  createTemplate: (data) => request('/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id, data) => request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: (id) => request(`/templates/${id}?confirm=true`, { method: 'DELETE' }),
  uploadTemplateSource: async (id, formData) => {
    try {
      const r = await fetch(`${API_BASE}/templates/${id}/source`, { method: 'POST', body: formData, credentials: 'include' });
      return await r.json();
    } catch (e) {
      const file = formData.get('file');
      if (!file || !(file instanceof Blob)) throw e;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(e);
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${API_BASE}/templates/${id}/source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      return await r.json();
    }
  },
  instantiateTemplate: (id) => request(`/templates/${id}/instantiate`, { method: 'POST' }),
  templateFileUrl: (id) => `${API_BASE}/templates/${id}/file`,

  // Settings
  getSettings: () => request('/settings'),
  updateSetting: (key, value) => request('/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),

  // Audit
  getAuditEvents: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/audit${query ? `?${query}` : ''}`)
  },

  // Storage
  describeStorage: () => request('/storage/describe'),

  // File download
  downloadFile: (ref) => `${API_BASE}/storage/download/${ref}`
}