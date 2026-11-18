// Daily backup of server/storage/app.db, run standalone via systemd timer
// (see systemd/caballerocano-db-backup.{service,timer}). Rotates through one
// file per weekday (7 fixed slots, overwritten week to week) so the backup
// directory never grows unbounded and there's nothing to prune by hand.
import db from './database.js';
import fsp from 'fs/promises';
import path from 'path';

function log(message) {
  console.log(`${new Date().toISOString()} ${message}`);
}

function logError(message) {
  console.error(`${new Date().toISOString()} ${message}`);
}

const BACKUP_DIR = process.env.BACKUP_PATH || '/var/backups/caballerocano';
const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
const tmpPath = path.join(BACKUP_DIR, `app-${weekday}.db.tmp`);
const finalPath = path.join(BACKUP_DIR, `app-${weekday}.db`);

async function main() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });

  // db.backup() is better-sqlite3's online-backup API: it copies a
  // consistent snapshot even while the live server process has the same
  // file open and is writing to it (unlike a plain fs.copyFile, which could
  // copy the file mid-write under WAL). db is this script's own standalone
  // connection to app.db, opened by importing database.js above.
  await db.backup(tmpPath);

  const stats = await fsp.stat(tmpPath);
  if (stats.size === 0) {
    await fsp.unlink(tmpPath);
    throw new Error('Backup produced an empty file');
  }

  await fsp.rename(tmpPath, finalPath);
  log(`Backup written to ${finalPath} (${(stats.size / 1024).toFixed(1)} KB, ${weekday} slot)`);
}

main()
  .then(() => { db.close(); process.exit(0); })
  .catch((err) => {
    logError(`Backup failed: ${err.message}`);
    db.close();
    process.exit(1);
  });
