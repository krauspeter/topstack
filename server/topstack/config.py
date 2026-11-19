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

    @property
    def secure_cookies(self) -> bool:
        return self.public_origin.startswith("https://")


settings = Settings()
