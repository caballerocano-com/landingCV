import db from '../db/database.js';

const FIELD_BY_TYPE = {
  presupuesto: 'ultimo_num_presupuesto',
  factura: 'ultimo_num_factura',
  recibo: 'ultimo_num_recibo',
};

const PREFIX_BY_TYPE = {
  presupuesto: 'PRES',
  factura: 'FACT',
  recibo: 'REC',
};

export function generarNumero(tipo) {
  const field = FIELD_BY_TYPE[tipo];
  const prefix = PREFIX_BY_TYPE[tipo];
  if (!field || !prefix) throw new Error(`Tipo de documento desconocido: ${tipo}`);

  const year = new Date().getFullYear();

  const tx = db.transaction(() => {
    const config = db.prepare('SELECT * FROM config WHERE id = 1').get();
    const next = (config[field] || 0) + 1;
    db.prepare(`UPDATE config SET ${field} = ? WHERE id = 1`).run(next);
    return next;
  });

  const next = tx();
  const padded = String(next).padStart(3, '0');
  return `${prefix}-${year}-${padded}`;
}

// This module exposes no routes of its own; it's imported by the
// presupuestos/facturas/ingresos routes for numbering + PDF orchestration.
export default async function documentosRoutes() {}
