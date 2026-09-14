from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "AIOS Guardian Backend"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]


settings = Settings()
