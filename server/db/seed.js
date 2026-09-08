import db from './database.js';

const CATALOGO = [
  { nombre: 'Mano de obra', descripcion: 'Hora de trabajo general', precio_unitario: 25, unidad: 'hora' },
  { nombre: 'Mano de obra especializada', descripcion: 'Hora de trabajo especializado', precio_unitario: 35, unidad: 'hora' },
  { nombre: 'Instalación de enchufe', descripcion: '', precio_unitario: 15, unidad: 'ud' },
  { nombre: 'Instalación de punto de luz', descripcion: '', precio_unitario: 20, unidad: 'ud' },
  { nombre: 'Instalación de grifo', descripcion: '', precio_unitario: 40, unidad: 'ud' },
  { nombre: 'Instalación de cisterna WC', descripcion: '', precio_unitario: 60, unidad: 'ud' },
  { nombre: 'Alicatado', descripcion: '', precio_unitario: 25, unidad: 'm2' },
  { nombre: 'Pladur tabique', descripcion: '', precio_unitario: 30, unidad: 'm2' },
  { nombre: 'Pladur techo', descripcion: '', precio_unitario: 35, unidad: 'm2' },
  { nombre: 'Enfoscado/enlucido', descripcion: '', precio_unitario: 15, unidad: 'm2' },
  { nombre: 'Soldadura TIG', descripcion: '', precio_unitario: 45, unidad: 'hora' },
  { nombre: 'Material y gestión', descripcion: 'Precio a definir según proyecto', precio_unitario: 0, unidad: 'global' },
];

const TIPOS_SERVICIO = [
  'Electricidad', 'Construcción', 'Pladur', 'Alicatados', 'Fontanería',
  'Piscinas', 'Seguridad', 'Carpintería', 'Soldadura', 'Manitas', 'Reformas',
];

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM elementos').get().c;
  if (count > 0) {
    console.log('elementos ya tiene datos, seed omitido');
    return;
  }
  const insert = db.prepare(
    `INSERT INTO elementos (nombre, descripcion, precio_unitario, unidad, activo)
     VALUES (@nombre, @descripcion, @precio_unitario, @unidad, 1)`
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });
  insertMany(CATALOGO);
  console.log(`Seed completado: ${CATALOGO.length} elementos insertados`);
}

function seedTiposServicio() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM tipos_servicio').get().c;
  if (count > 0) {
    console.log('tipos_servicio ya tiene datos, seed omitido');
    return;
  }
  const insert = db.prepare('INSERT INTO tipos_servicio (nombre) VALUES (?)');
  const insertMany = db.transaction((items) => {
    for (const nombre of items) insert.run(nombre);
  });
  insertMany(TIPOS_SERVICIO);
  console.log(`Seed completado: ${TIPOS_SERVICIO.length} tipos de servicio insertados`);
}

seed();
seedTiposServicio();
