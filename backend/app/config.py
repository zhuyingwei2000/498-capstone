import os
from dotenv import load_dotenv

# Loads variables from backend/.env into the process environment.
load_dotenv()


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    DEBUG = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
