from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from app.config import Config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()


def create_app():
    """Flask application factory.

    Using a factory (instead of a module-level `app = Flask(__name__)`)
    keeps app creation testable and avoids import-order issues between
    extensions, models, and routes.
    """
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    # Allows the React dev server (different port) to call this API.
    CORS(app)

    from app.auth import auth_bp
    app.register_blueprint(auth_bp)

    from app import models  # noqa: F401  (registers models with SQLAlchemy)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app
