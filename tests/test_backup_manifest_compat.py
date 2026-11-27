"""003 is required for upload-aware backups; old recovery archives stay valid."""

import hashlib
import io
import tempfile
import unittest
from pathlib import Path

from test_offsite_backup import archive_bytes, backup, common, fixture


MIGRATION = "recovery/003-service-uploads.sql"


class MigrationCompatibilityTests(unittest.TestCase):
    def test_existing_snapshot_without_uploads_or_003_still_valid(self):
        manifest, data = fixture()
        self.assertNotIn("service_uploads", manifest["counts"])
        self.assertNotIn(MIGRATION, manifest["files"])
        with tempfile.TemporaryDirectory() as temporary:
            parsed = backup.validate_archive(
                io.BytesIO(archive_bytes(manifest, data)),
                Path(temporary) / "database.dump",
            )
            self.assertEqual(parsed, manifest)

    def test_new_upload_table_even_empty_requires_003(self):
        for count in (0, 3):
            manifest, _ = fixture()
            manifest["counts"].update(service_uploads=count, service_upload_lock=1)
            with self.subTest(count=count), self.assertRaises(common.Failure):
                common.validate_manifest(manifest)

    def test_new_snapshot_with_003_valid_and_file_authenticated(self):
        manifest, data = fixture()
        manifest["counts"].update(service_uploads=0, service_upload_lock=1)
        data[MIGRATION] = b"-- synthetic migration 003 only\n"

        manifest["files"][MIGRATION] = {
            "size": len(data[MIGRATION]),
            "sha256": hashlib.sha256(data[MIGRATION]).hexdigest(),
        }
        with tempfile.TemporaryDirectory() as temporary:
            parsed = backup.validate_archive(
                io.BytesIO(archive_bytes(manifest, data)),
                Path(temporary) / "database.dump",
            )
            self.assertIn(MIGRATION, parsed["files"])
        data[MIGRATION] = b"-- modified migration contents\n"
        with (
            tempfile.TemporaryDirectory() as temporary,
            self.assertRaises(common.Failure),
        ):
            backup.validate_archive(
                io.BytesIO(archive_bytes(manifest, data)),
                Path(temporary) / "database.dump",
            )

    def test_staged_003_before_table_migration_is_compatible(self):
        manifest, data = fixture()
        data[MIGRATION] = b"-- staged before database migration\n"

        manifest["files"][MIGRATION] = {
            "size": len(data[MIGRATION]),
            "sha256": hashlib.sha256(data[MIGRATION]).hexdigest(),
        }
        self.assertEqual(common.validate_manifest(manifest), manifest)
        self.assertEqual(
            common.OPTIONAL_FILES[MIGRATION],
            "/opt/skm-site-maintenance/migrations/003-service-uploads.sql",
        )


if __name__ == "__main__":
    unittest.main()
