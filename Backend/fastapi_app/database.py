# database.py
# Manages the asyncpg connection pool for all database operations.
# connect() is called once at application startup via the FastAPI lifespan handler
# in main.py, and disconnect() is called on shutdown.
# All routers access the pool through get_pool() rather than importing it directly.

import os
import ssl

import asyncpg
from config import cfg  # Provides cfg.database_url from the .env file

# Module-level pool variable, initialised to None until connect() is called.
# type: ignore suppresses the type checker warning about None not being asyncpg.Pool,
# since it will always be set before any route handler calls get_pool().
pool: asyncpg.Pool = None  # type: ignore


async def connect():
    """
    Creates the asyncpg connection pool and assigns it to the module-level pool variable.
    Called once during application startup by the lifespan handler in main.py.

    In production (NODE_ENV=production), SSL is enabled with certificate verification
    disabled. This is necessary for managed PostgreSQL services like AWS RDS which use
    self-signed certificates, where strict hostname/cert checking would reject the connection.

    In development, SSL is left as None so asyncpg connects without encryption,
    matching a typical local PostgreSQL setup.
    """
    global pool

    ssl_ctx = None

    if os.getenv("NODE_ENV") == "production":
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False   # Skip hostname verification for self-signed certs
        ssl_ctx.verify_mode = ssl.CERT_NONE  # Accept any certificate from the server

    # create_pool establishes a pool of reusable connections using the DATABASE_URL
    # from .env, e.g. postgresql://postgres:pass@localhost:5432/Weather_db
    pool = await asyncpg.create_pool(cfg.database_url, ssl=ssl_ctx)


async def disconnect():
    """
    Gracefully closes all connections in the pool.
    Called during application shutdown by the lifespan handler in main.py
    to ensure no connections are left open when the server stops.
    """
    if pool:
        await pool.close()


async def get_pool() -> asyncpg.Pool:
    """
    Returns the active connection pool for use by route handlers.
    All routers call this function rather than importing the pool variable directly,
    keeping database access centralised and making the pool easy to mock in tests.
    """
    return pool