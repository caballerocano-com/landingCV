import db from '../db/database.js';

const FIELD_BY_TYPE = {
  presupuesto: 'ultimo_num_presupuesto',
  factura: 'ultimo_num_factura',
  recibo: 'ultimo_num_recibo',
  encargo: 'ultimo_num_encargo',
  rectificativa: 'ultimo_num_rectificativa',
};

// factura has no prefix ("2026-001"); every other type keeps one so its
// series never collides with factura's or rectificativa's in the shared,
// globally-UNIQUE facturas.numero column.
const PREFIX_BY_TYPE = {
  presupuesto: 'PRES',
  factura: '',
  recibo: 'REC',
  encargo: 'ENC',
  rectificativa: 'RECT',
};

// 'factura' and 'rectificativa' use a per-(tipo, anio) correlative counter
// that resets every calendar year (see the `series` table). Other document
// types still use the older single running counter in `config` until they
// get migrated too.
const SERIES_TIPOS = new Set(['factura', 'rectificativa']);

function formatNumero(prefix, year, secuencia) {
  const padded = String(secuencia).padStart(3, '0');
  return prefix ? `${prefix}-${year}-${padded}` : `${year}-${padded}`;
}

export function generarNumero(tipo, { anio } = {}) {
  const prefix = PREFIX_BY_TYPE[tipo];
  if (prefix === undefined) throw new Error(`Tipo de documento desconocido: ${tipo}`);

  const year = anio || new Date().getFullYear();

  if (!SERIES_TIPOS.has(tipo)) {
    const field = FIELD_BY_TYPE[tipo];
    const tx = db.transaction(() => {
      const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
      const next = (config[field] || 0) + 1;
      db.prepare(`UPDATE config SET ${field} = ? WHERE id = 1`).run(next);
      return next;
    });
    const next = tx();
    return formatNumero(prefix, year, next);
  }

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO series (tipo, anio, ultimo_numero) VALUES (?, ?, 0)
                ON CONFLICT (tipo, anio) DO NOTHING`).run(tipo, year);
    const row = db.prepare(`SELECT ultimo_numero FROM series WHERE tipo = ? AND anio = ?`).get(tipo, year);
    const next = row.ultimo_numero + 1;
    db.prepare(`UPDATE series SET ultimo_numero = ? WHERE tipo = ? AND anio = ?`).run(next, tipo, year);
    return next;
  });

  const next = tx();
  return formatNumero(prefix, year, next);
}

// Parses a numero like "2026-003" (factura, no prefix) or "RECT-2026-003"
// (any other type) for the given tipo, into its year and sequence, or
// returns null if it doesn't follow that pattern.
function parseNumeroSerie(tipo, numero) {
  const prefix = PREFIX_BY_TYPE[tipo];
  if (prefix === undefined || !numero) return null;
  const pattern = prefix ? `^${prefix}-(\\d{4})-(\\d+)$` : `^(\\d{4})-(\\d+)$`;
  const match = new RegExp(pattern).exec(numero);
  if (!match) return null;
  return { anio: parseInt(match[1], 10), secuencia: parseInt(match[2], 10) };
}

// Called when a numero is set by hand (rather than generated) for a factura
// or rectificativa in borrador, so the series counter never hands out a
// number that collides with the one just typed in.
export function registrarNumeroManual(tipo, numero) {
  if (!SERIES_TIPOS.has(tipo)) return;
  const parsed = parseNumeroSerie(tipo, numero);
  if (!parsed) return;
  db.prepare(`INSERT INTO series (tipo, anio, ultimo_numero) VALUES (?, ?, ?)
              ON CONFLICT (tipo, anio) DO UPDATE SET ultimo_numero = MAX(ultimo_numero, excluded.ultimo_numero)`)
    .run(tipo, parsed.anio, parsed.secuencia);
}

export function numeroEnUso(numero, excludeId) {
  return !!db.prepare('SELECT id FROM facturas WHERE numero = ? AND id != ?').get(numero, excludeId ?? -1);
}

// This module exposes no routes of its own; it's imported by the
// presupuestos/facturas/ingresos routes for numbering + PDF orchestration.
export default async function documentosRoutes() {}
