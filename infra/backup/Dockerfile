# Backup-Werkzeug für TopStack (Phase 4, AP-1, ADR-0016).
# Gleiche PostgreSQL-Version wie die Datenbank, damit pg_dump und pg_restore passen.
FROM postgres:16

RUN apt-get update \
 && apt-get install -y --no-install-recommends age rclone curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY topstack-backup.sh /usr/local/bin/topstack-backup
RUN chmod 755 /usr/local/bin/topstack-backup

ENTRYPOINT ["/usr/local/bin/topstack-backup"]
CMD ["backup", "manual"]
