CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  nif TEXT,
  direccion_fiscal TEXT,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER REFERENCES clientes(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo_servicio TEXT,
  direccion_obra TEXT,
  estado TEXT DEFAULT 'presupuestado',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS elementos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_unitario REAL DEFAULT 0,
  unidad TEXT DEFAULT 'ud',
  activo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS conceptos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER REFERENCES proyectos(id),
  elemento_id INTEGER,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  cantidad REAL DEFAULT 1,
  precio_unitario REAL DEFAULT 0,
  unidad TEXT DEFAULT 'ud',
  completado INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER REFERENCES proyectos(id),
  numero TEXT NOT NULL UNIQUE,
  porcentaje_cobro INTEGER DEFAULT 100,
  estado TEXT DEFAULT 'borrador',
  notas TEXT,
  pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER REFERENCES proyectos(id),
  presupuesto_id INTEGER,
  numero TEXT NOT NULL UNIQUE,
  iva_porcentaje REAL DEFAULT 21,
  estado TEXT DEFAULT 'emitida',
  fecha_vencimiento TEXT,
  notas TEXT,
  pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER REFERENCES proyectos(id),
  token TEXT NOT NULL UNIQUE,
  terminos TEXT,
  metodo_pago TEXT,
  plazos_pago TEXT,
  estado TEXT DEFAULT 'pendiente',
  firmado_at TEXT,
  firmado_ip TEXT,
  pdf_path TEXT,
  pdf_hash TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingresos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER,
  factura_id INTEGER,
  presupuesto_id INTEGER,
  concepto TEXT NOT NULL,
  importe REAL NOT NULL,
  fecha TEXT NOT NULL,
  metodo TEXT,
  notas TEXT,
  recibo_pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recibos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingreso_id INTEGER REFERENCES ingresos(id),
  numero TEXT NOT NULL UNIQUE,
  pdf_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER,
  concepto TEXT NOT NULL,
  importe REAL NOT NULL,
  fecha TEXT NOT NULL,
  categoria TEXT,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS horas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER REFERENCES proyectos(id),
  fecha TEXT NOT NULL,
  horas REAL NOT NULL,
  descripcion TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ultimo_num_presupuesto INTEGER DEFAULT 0,
  ultimo_num_factura INTEGER DEFAULT 0,
  ultimo_num_recibo INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO config (id, ultimo_num_presupuesto, ultimo_num_factura, ultimo_num_recibo)
VALUES (1, 0, 0, 0);
