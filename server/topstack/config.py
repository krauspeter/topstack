from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Konfiguration ausschließlich über Umgebungsvariablen (ADR-0009: keine Secrets im Repo)."""

    model_config = SettingsConfigDict(env_prefix="TOPSTACK_", env_file=".env", extra="ignore")

    environment: str = "dev"
    database_url: str = "postgresql+asyncpg://topstack:topstack@localhost:5432/topstack"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    public_origin: str = "http://localhost:5173"


settings = Settings()
