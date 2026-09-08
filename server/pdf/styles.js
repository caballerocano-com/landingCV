export const OWNER = {
  nombre: 'Antonio Caballero Cano',
  nif: 'XXXXXXXX', // Antonio: replace with your NIF
  direccion: 'Salteras, Sevilla',
  telefono: '+34 623 800 979',
  email: 'antonio@caballerocano.com',
  web: 'caballerocano.com',
  cuenta_bancaria: 'ESXX XXXX XXXX XXXX XXXX XXXX', // Antonio: replace
  bizum: '623 800 979',
};

export const COLORS = {
  text: '#0f1f2e',
  textMid: '#2c3e50',
  textMuted: '#57677a',
  border: '#dfe3e8',
  accent: '#f15a24',
  accentDark: '#cf4415',
  bgAlt: '#f4f6f8',
  white: '#ffffff',
};

export const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
};

export function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function formatDateEs(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
