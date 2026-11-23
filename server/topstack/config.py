from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Konfiguration ausschließlich über Umgebungsvariablen (ADR-0009: keine Secrets im Repo)."""

    model_config = SettingsConfigDict(env_prefix="TOPSTACK_", env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = "postgresql+asyncpg://topstack:topstack@localhost:5432/topstack"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    public_origin: str = "http://localhost:5173"

    # Anmeldung (ADR-0008)
    session_days: int = 365
    magic_link_minutes: int = 15
    magic_links_per_quarter_hour: int = 5
    invitation_days: int = 7

    # E-Mail über Resend (Entscheidung E2); ohne Schlüssel landen Links nur im Log
    resend_api_key: str | None = None
    mail_from: str = "TopStack <login@topstack.win>"
    # Staging (AP-3b): nur an diese Adressen wirklich senden, kommagetrennt; leer = an alle
    mail_allowlist: str = ""

    # Web Push (AP-8): Schlüssel aus `python -m topstack.scripts.vapid_keys`; leer = kein Push
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:admin@topstack.win"

    @property
    def mail_allowed(self) -> frozenset[str]:
        return frozenset(a.strip().lower() for a in self.mail_allowlist.split(",") if a.strip())

    @property
    def secure_cookies(self) -> bool:
        return self.public_origin.startswith("https://")


settings = Settings()
