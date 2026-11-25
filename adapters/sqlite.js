import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function open(settings, directory) {
  const catalog = JSON.parse(readFileSync(resolve(directory, settings.catalog), 'utf8').replace(/^\uFEFF/, ''));
  const db = new DatabaseSync(resolve(directory, settings.database), { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF');
  const reports = catalog.reports.map(({id, description, parameters}) => ({id, description, parameters}));
  return {
    manual: catalog.manual, reports,
    run(id, params) {
      const report = catalog.reports.find(r => r.id === id);
      const result = db.prepare(report.sql).all(params);
      return result;
    },
    close() { db.close(); }
  };
}
