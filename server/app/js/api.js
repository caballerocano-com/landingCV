const BASE = '/api';
const getToken = () => localStorage.getItem('app_token');

async function apiFetch(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      // Only set when there's an actual body: Fastify's JSON parser rejects
      // a request with Content-Type: application/json and no body at all
      // (FST_ERR_CTP_EMPTY_JSON_BODY) — this hit every bodiless POST, e.g.
      // recibo generation and logout.
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('app_token');
    window.location.href = '/app/index.html';
    return null;
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const error = new Error((data && data.error) || `Error ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function downloadPDF(apiPath, filename) {
  const res = await fetch(apiPath, {
    headers: {
      'Authorization': `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) {
    console.error('PDF download failed:', res.status);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'documento.pdf';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export { apiFetch, getToken, BASE, downloadPDF };
