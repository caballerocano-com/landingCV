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
