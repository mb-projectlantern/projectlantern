import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Real SQLite using the same migration and SQL as D1; not a production D1 substitute.
export function database(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(readFileSync(new URL('../migrations/0001_results.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      let args = [];
      const stmt = sqlite.prepare(sql);
      return {
        bind(...values) { args = values; return this; },
        async run() { const out = stmt.run(...args); return { meta: { changes: Number(out.changes) } }; },
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; }
      };
    }
  };
}
