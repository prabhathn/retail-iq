import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # PostgreSQL
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "postgres")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "")
    # TLS. Snowflake Postgres requires an encrypted connection, so the bare
    # postgresql://user:pass@host/db URL this used to build could never connect.
    # verify-ca additionally authenticates the server using the instance CA cert
    # (fetched to ~/.snowflake/postgres/certs/<instance>.pem), which protects
    # against MITM. Set POSTGRES_SSLMODE=require to skip cert verification, or
    # 'disable' for a plain local Postgres.
    POSTGRES_SSLMODE: str = os.getenv("POSTGRES_SSLMODE", "prefer")
    POSTGRES_SSLROOTCERT: str = os.getenv("POSTGRES_SSLROOTCERT", "")

    @property
    def DATABASE_URL(self) -> str:
        from urllib.parse import quote_plus

        # Passwords from Snowflake Postgres are generated and can contain
        # characters that are not URL-safe (@, /, :, #). Quoting them prevents a
        # confusing "could not translate host name" error caused by the URL being
        # parsed at the wrong delimiter.
        user = quote_plus(self.POSTGRES_USER)
        password = quote_plus(self.POSTGRES_PASSWORD)
        base = (
            f"postgresql://{user}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

        params = []
        if self.POSTGRES_SSLMODE:
            params.append(f"sslmode={self.POSTGRES_SSLMODE}")
        if self.POSTGRES_SSLROOTCERT:
            params.append(f"sslrootcert={quote_plus(self.POSTGRES_SSLROOTCERT)}")
        return f"{base}?{'&'.join(params)}" if params else base
    
    # Snowflake
    SNOWFLAKE_ACCOUNT: str = os.getenv("SNOWFLAKE_ACCOUNT", "")
    SNOWFLAKE_USER: str = os.getenv("SNOWFLAKE_USER", "")
    SNOWFLAKE_PASSWORD: str = os.getenv("SNOWFLAKE_PASSWORD", "")
    SNOWFLAKE_DATABASE: str = os.getenv("SNOWFLAKE_DATABASE", "RETAILIQ_ANALYTICS")
    SNOWFLAKE_SCHEMA: str = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
    SNOWFLAKE_WAREHOUSE: str = os.getenv("SNOWFLAKE_WAREHOUSE", "RETAILIQ_WH")
    
    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "secret")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

settings = Settings()

