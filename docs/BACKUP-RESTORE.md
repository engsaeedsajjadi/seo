# Backup and restore

The operator runs database backups. The application does not provide them per organization.

```bash
BACKUP_DIR=/var/backups/rankforge RETENTION_DAYS=14 scripts/ops/backup.sh
scripts/ops/restore.sh /var/backups/rankforge/rankforge_<time>.dump rankforge_restore_check
```

- Schedule `backup.sh` daily with cron, and copy each file off the host.
- `restore.sh` only creates a new database and refuses an existing name. Switch the application to it only after checking it.
- Run a restore on a schedule: an untested backup does not count as a backup.
- Keep `ENCRYPTION_KEY` backed up separately. Without it, stored OAuth tokens cannot be decrypted after a restore.
