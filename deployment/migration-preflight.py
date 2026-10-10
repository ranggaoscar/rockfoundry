"""Read-only source DB; rehearse pending committed SQL in an in-memory backup.
Not a replacement for prisma migrate deploy; never touches live migration metadata.
"""
import argparse
import hashlib
import json
import pathlib
import sqlite3


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', required=True)
    parser.add_argument('--migrations', required=True)
    args = parser.parse_args()
    source = pathlib.Path(args.database).resolve()
    db = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    clone = sqlite3.connect(':memory:')
    db.backup(clone)
    old_tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'")]
    migrations = pathlib.Path(args.migrations)
    applied = {}
    for name, checksum, finished, rolled in db.execute('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations'):
        if not finished and not rolled:
            raise RuntimeError('Unresolved failed migration: ' + name)
        if finished:
            applied[name] = checksum
    pending = []
    for folder in sorted(migrations.iterdir()):
        script = folder / 'migration.sql'
        if not script.is_file():
            continue
        raw = script.read_bytes()
        normalized = raw.replace(b'\r\n', b'\n')
        # Prisma accepts line-ending variants; Windows checkout must not flag Linux SQL as drift.
        checksums = {hashlib.sha256(value).hexdigest() for value in [raw, normalized, normalized.replace(b'\n', b'\r\n')]}
        if folder.name in applied:
            if applied[folder.name] not in checksums:
                raise RuntimeError('Applied migration checksum mismatch: ' + folder.name)
            continue
        clone.executescript(script.read_text(encoding='utf-8'))
        pending.append(folder.name)
    for table in old_tables:
        columns = [row[1] for row in db.execute('PRAGMA table_info("' + table.replace('"', '""') + '")')]
        select = ','.join('"' + column.replace('"', '""') + '"' for column in columns)
        query = 'SELECT ' + select + ' FROM "' + table.replace('"', '""') + '" ORDER BY 1'
        if db.execute(query).fetchall() != clone.execute(query).fetchall():
            raise RuntimeError('Existing table row/column changed: ' + table)
    foreign_keys = clone.execute('PRAGMA foreign_key_check').fetchall()
    integrity = clone.execute('PRAGMA integrity_check').fetchone()[0]
    if foreign_keys or integrity != 'ok':
        raise RuntimeError('Clone integrity/foreign-key check failed')
    print(json.dumps({'pending': pending, 'legacy_table_count': len(old_tables), 'all_legacy_rows_preserved': True, 'integrity': integrity, 'foreign_key_violations': len(foreign_keys), 'mode': 'read-only-source + in-memory-rehearsal'}, indent=2))
    db.close()
    clone.close()


if __name__ == '__main__':
    main()
