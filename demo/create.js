import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, copyFileSync, constants, rmSync, rmdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('./sample.sqlite', import.meta.url));
const dir = mkdtempSync(join(dirname(destination), 'staging-'));
const file = join(dir, 'sample.sqlite');
try {
  const db = new DatabaseSync(file);
  try {
    db.exec(`CREATE TABLE person(id INTEGER PRIMARY KEY, age_years INTEGER, subdistrict TEXT);
      CREATE TABLE reading(id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES person(id), measured_at TEXT, systolic REAL, diastolic REAL);
      INSERT INTO person VALUES (1,67,'สาธิต'),(2,72,'สาธิต'),(3,60,'สาธิต'),(4,59,'สาธิต'),(5,80,'ตัวอย่าง');
      INSERT INTO reading VALUES (1,1,'2025-01-01',147,92),(2,1,'2025-02-01',139,85),
      (3,2,'2025-02-01',145,95),(4,3,'2025-02-01',148,89),(5,4,'2025-02-01',150,95),
      (6,5,'2025-02-01',120,80);`);
  } finally { db.close(); }
  try { copyFileSync(file, destination, constants.COPYFILE_EXCL); console.log('Created synthetic sample.sqlite'); }
  catch (e) { if (e.code !== 'EEXIST') throw e; console.log('sample.sqlite already exists'); }
} finally { rmSync(file, { force: true }); rmdirSync(dir); }
