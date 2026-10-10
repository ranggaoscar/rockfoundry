"""Focused offline release-safety checks; no Docker or production access."""
import pathlib
import sqlite3
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parent


class ReleaseSafetyTests(unittest.TestCase):
    def test_wal_backup_restores_committed_rows_and_integrity(self):
        with tempfile.TemporaryDirectory() as temp:
            source = pathlib.Path(temp) / "source.db"
            backup = pathlib.Path(temp) / "backup.db"
            restored = pathlib.Path(temp) / "restored.db"
            db = sqlite3.connect(source)
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE legacy (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
            db.commit()
            db.execute("INSERT INTO legacy VALUES (?, ?)", (1, "checkpointed"))
            db.commit()
            db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            db.execute("INSERT INTO legacy VALUES (?, ?)", (2, "still-in-WAL"))
            db.commit()
            self.assertTrue(pathlib.Path(str(source) + "-wal").exists())

            target = sqlite3.connect(backup)
            db.backup(target)
            target.close()
            backup_db = sqlite3.connect(backup)
            rows = backup_db.execute("SELECT * FROM legacy ORDER BY id").fetchall()
            self.assertEqual(rows, [(1, "checkpointed"), (2, "still-in-WAL")])
            self.assertEqual(backup_db.execute("PRAGMA integrity_check").fetchall(), [("ok",)])

            restored_db = sqlite3.connect(restored)
            backup_db.backup(restored_db)
            restored_db.close()
            backup_db.close()
            restore_check = sqlite3.connect(restored)
            self.assertEqual(restore_check.execute("SELECT * FROM legacy ORDER BY id").fetchall(), rows)
            restore_check.close()
            db.close()

    def test_compose_delta_has_no_duplicate_image_or_migration_service(self):
        delta = (ROOT / "compose.hermes-work-os.yml").read_text()
        self.assertNotIn("    image:", delta)
        self.assertNotIn("  migrate:", delta)
        self.assertEqual(delta.count("  web:"), 1)

    def test_candidate_runtime_dependencies_and_fail_closed_guards(self):
        dockerfile = (ROOT / "Dockerfile.work-os").read_text()
        runner = (ROOT / "migrate-entrypoint.sh").read_text()
        wrapper = (ROOT / "rockfoundry-deploy-candidate.sh").read_text()
        for package in ("python3", "sqlite3", "openssl", "libssl3"):
            self.assertIn(package, dockerfile)
        for marker in ("ROCKFOUNDRY_EXPECTED_IMAGE_ID", "/proc/self/mountinfo", "src.backup(dst)", "PRAGMA integrity_check", "legacy rows changed"):
            self.assertIn(marker, runner)
        self.assertIn("ROCKFOUNDRY_BACKUP_DIR=/opt/rockfoundry/backups", wrapper)
        self.assertIn("docker run", wrapper)
        self.assertIn("docker compose", wrapper)


if __name__ == "__main__":
    unittest.main(verbosity=2)
