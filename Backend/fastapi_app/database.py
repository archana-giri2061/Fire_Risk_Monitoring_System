import os
import ssl
import asyncpg
from config import cfg

pool: asyncpg.Pool = None  # type: ignore


async def connect():
    global pool
    ssl_ctx = None
    if os.getenv("NODE_ENV") == "production":
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    pool = await asyncpg.create_pool(cfg.database_url, ssl=ssl_ctx)


async def disconnect():
    if pool:
        await pool.close()


async def get_pool() -> asyncpg.Pool:
    return pool