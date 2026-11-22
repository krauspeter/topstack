# Backup-Werkzeug für TopStack (Phase 4, AP-1, ADR-0016).
# rclone aus dem offiziellen Image, fest auf eine Version: Debians rclone 1.60 fragt nach dem
# Upload mit ?versionId nach, das R2 nicht kennt (501 Not Implemented). Dependabot hält die
# Version aktuell (.github/dependabot.yml).
FROM rclone/rclone:1.76.0 AS rclone

# Gleiche PostgreSQL-Version wie die Datenbank, damit pg_dump und pg_restore passen.
FROM postgres:16

RUN apt-get update \
 && apt-get install -y --no-install-recommends age curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
# Die Verbindung zu R2 kommt aus Umgebungsvariablen; eine leere Konfigurationsdatei
# verhindert den Hinweis „Config file not found“ bei jedem Aufruf.
RUN touch /etc/rclone.conf && rclone version | head -n1
ENV RCLONE_CONFIG=/etc/rclone.conf

COPY topstack-backup.sh /usr/local/bin/topstack-backup
RUN chmod 755 /usr/local/bin/topstack-backup

ENTRYPOINT ["/usr/local/bin/topstack-backup"]
CMD ["backup", "manual"]
