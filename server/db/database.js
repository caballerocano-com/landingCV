import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../storage');
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(name) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
}

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

// Repairs a table left with a dangling `REFERENCES "proyectos_migration_old"`
// clause by an earlier, now-fixed version of the proyectos rebuild below
// (that intermediate name gets picked up by SQLite's automatic FK-text
// rewrite on ALTER TABLE ... RENAME, then never gets renamed back). Rebuilds
// the table in place, pointing the FK back at "proyectos", preserving data.
function repointDanglingProyectoFk(table) {
  const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`).get(table);
  if (!info || !info.sql.includes('proyectos_migration_old')) return;

  const tempName = `${table}_migration_fix`;
  const fixedSql = info.sql
    .replace(new RegExp(`CREATE TABLE\\s+${table}\\b`), `CREATE TABLE ${tempName}`)
    .replace(/"?proyectos_migration_old"?/g, 'proyectos');
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name).join(', ');

  db.pragma('foreign_keys = OFF');
  db.exec(`
    ${fixedSql};
    INSERT INTO ${tempName} (${columns}) SELECT ${columns} FROM ${table};
    DROP TABLE ${table};
    ALTER TABLE ${tempName} RENAME TO ${table};
  `);
  db.pragma('foreign_keys = ON');
}

// Migrates a pre-existing database (created before a schema change) up to
// the shape schema.sql now expects. No-op on a fresh database, since the
// CREATE TABLE statements below already produce the current shape.
function migrate() {
  for (const table of ['conceptos', 'presupuestos', 'facturas', 'contratos', 'horas']) {
    repointDanglingProyectoFk(table);
  }

  if (tableExists('contratos') && !columnExists('contratos', 'numero')) {
    db.exec(`ALTER TABLE contratos ADD COLUMN numero TEXT`);
  }

  if (tableExists('config') && !columnExists('config', 'ultimo_num_encargo')) {
    db.exec(`ALTER TABLE config ADD COLUMN ultimo_num_encargo INTEGER DEFAULT 0`);
  }

  if (tableExists('config') && !columnExists('config', 'ultimo_num_rectificativa')) {
    db.exec(`ALTER TABLE config ADD COLUMN ultimo_num_rectificativa INTEGER DEFAULT 0`);
  }

  if (tableExists('contratos') && !columnExists('contratos', 'incluir_fotos')) {
    db.exec(`ALTER TABLE contratos ADD COLUMN incluir_fotos INTEGER DEFAULT 0`);
  }

  if (tableExists('recibos') && !columnExists('recibos', 'estado')) {
    // Backfills existing rows to 'emitido' too (SQLite applies a column's
    // DEFAULT to already-existing rows on ALTER TABLE ADD COLUMN), which is
    // correct here: a pre-existing recibo already represents money received.
    db.exec(`ALTER TABLE recibos ADD COLUMN estado TEXT DEFAULT 'emitido'`);
  }

  if (tableExists('facturas') && !columnExists('facturas', 'factura_original_id')) {
    db.exec(`ALTER TABLE facturas ADD COLUMN factura_original_id INTEGER REFERENCES facturas(id)`);
  }
  if (tableExists('facturas') && !columnExists('facturas', 'es_rectificativa')) {
    db.exec(`ALTER TABLE facturas ADD COLUMN es_rectificativa INTEGER DEFAULT 0`);
  }

  // facturas used to default new rows to estado='emitida'; SQLite can't
  // ALTER a column's DEFAULT in place, so the table is rebuilt with an
  // explicit column list on both sides of the copy (never SELECT *) since
  // columns added later via ALTER TABLE ADD COLUMN live at the *end* of the
  // real on-disk column order, not wherever schema.sql's CREATE TABLE lists
  // them — a positional SELECT * copy would silently shuffle data between
  // columns. No other table has a declared FK pointing at facturas(id), so
  // this rebuild needs no special foreign-key handling.
  const facturasTable = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='facturas'`).get();
  if (facturasTable && facturasTable.sql.includes("DEFAULT 'emitida'")) {
    db.exec(`
      CREATE TABLE facturas_migration_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER REFERENCES proyectos(id),
        presupuesto_id INTEGER,
        numero TEXT NOT NULL UNIQUE,
        iva_porcentaje REAL DEFAULT 21,
        estado TEXT DEFAULT 'borrador',
        fecha_vencimiento TEXT,
        notas TEXT,
        pdf_path TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        factura_original_id INTEGER REFERENCES facturas(id),
        es_rectificativa INTEGER DEFAULT 0
      );
      INSERT INTO facturas_migration_new (id, proyecto_id, presupuesto_id, numero, iva_porcentaje, estado, fecha_vencimiento, notas, pdf_path, created_at, factura_original_id, es_rectificativa)
        SELECT id, proyecto_id, presupuesto_id, numero, iva_porcentaje, estado, fecha_vencimiento, notas, pdf_path, created_at, factura_original_id, es_rectificativa
        FROM facturas;
      DROP TABLE facturas;
      ALTER TABLE facturas_migration_new RENAME TO facturas;
    `);
  }

  // Same rebuild for contratos: default was 'pendiente', and the state
  // machine itself changed (borrador -> enviado -> firmado -> anulado;
  // 'expirado' is now computed from expires_at at read time instead of
  // being persisted). Existing rows are normalized to the closest new state.
  const contratosTable = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='contratos'`).get();
  if (contratosTable && contratosTable.sql.includes("DEFAULT 'pendiente'")) {
    db.exec(`
      CREATE TABLE contratos_migration_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER REFERENCES proyectos(id),
        numero TEXT,
        token TEXT NOT NULL UNIQUE,
        terminos TEXT,
        metodo_pago TEXT,
        plazos_pago TEXT,
        estado TEXT DEFAULT 'borrador',
        firmado_at TEXT,
        firmado_ip TEXT,
        pdf_path TEXT,
        pdf_hash TEXT,
        expires_at TEXT,
        incluir_fotos INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO contratos_migration_new (id, proyecto_id, numero, token, terminos, metodo_pago, plazos_pago, estado, firmado_at, firmado_ip, pdf_path, pdf_hash, expires_at, incluir_fotos, created_at)
        SELECT id, proyecto_id, numero, token, terminos, metodo_pago, plazos_pago, estado, firmado_at, firmado_ip, pdf_path, pdf_hash, expires_at, incluir_fotos, created_at
        FROM contratos;
      DROP TABLE contratos;
      ALTER TABLE contratos_migration_new RENAME TO contratos;
      UPDATE contratos SET estado = 'borrador' WHERE estado = 'pendiente';
      UPDATE contratos SET estado = 'enviado' WHERE estado = 'expirado';
    `);
  }

  const proyectosTable = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='proyectos'`).get();
  const needsProyectosRebuild = proyectosTable && proyectosTable.sql.includes("DEFAULT 'presupuestado'");
  const hasStaleMigrationTable = tableExists('proyectos_migration_old');

  if (needsProyectosRebuild || hasStaleMigrationTable) {
    // DROP TABLE performs an implicit delete of the table's own rows when
    // foreign_keys is on, which conflicts with other tables' proyecto_id
    // FKs pointing at it — so FK enforcement must be off for this whole
    // rebuild. Renaming the *replacement* table into the "proyectos" name
    // (rather than renaming "proyectos" itself away) keeps every other
    // table's existing FK text ("REFERENCES proyectos(id)") valid without
    // having to touch those tables at all.
    db.pragma('foreign_keys = OFF');

    if (needsProyectosRebuild) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS proyectos_migration_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER REFERENCES clientes(id),
          nombre TEXT NOT NULL,
          descripcion TEXT,
          tipo_servicio TEXT,
          direccion_obra TEXT,
          estado TEXT DEFAULT 'creado',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO proyectos_migration_new (id, cliente_id, nombre, descripcion, tipo_servicio, direccion_obra, estado, created_at, updated_at)
          SELECT id, cliente_id, nombre, descripcion, tipo_servicio, direccion_obra, estado, created_at, updated_at
          FROM proyectos;
        DROP TABLE proyectos;
        ALTER TABLE proyectos_migration_new RENAME TO proyectos;
      `);
    }

    // Left over from an earlier interrupted run of this same migration.
    if (tableExists('proyectos_migration_old')) {
      db.exec(`DROP TABLE proyectos_migration_old`);
    }

    db.pragma('foreign_keys = ON');
  }
}

migrate();

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

export default db;
