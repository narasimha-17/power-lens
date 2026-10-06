from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    ollama_timeout_s: float = 180.0

    query_timeout_s: float = 15.0
    max_result_rows: int = 1000

    duckdb_path: str = "backend/app/storage/powerlens.duckdb"
    uploads_dir: str = "backend/app/storage/uploads"
    app_db_path: str = "backend/app/storage/powerlens_meta.sqlite"

    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_prefix="POWERLENS_")


settings = Settings()
