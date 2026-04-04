"""
वन दृष्टि — FastAPI Backend
=============================
Start: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
Docs:  http://localhost:8000/docs

Folder: Backend/fastapi_app/main.py
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from routers import weather, ml, alerts, sensor, dashboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    yield
    await database.disconnect()


app = FastAPI(
    title="वन दृष्टि — Fire Risk Monitoring API",
    description=(
        "FastAPI backend for the Wildfire Risk Monitoring System.\n\n"
        "Mirrors all Express routes from src/routes/.\n\n"
        "**Start:** `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Health check ───────────────────────────────────────────────────────────
@app.get("/check", tags=["Health"])
async def health_check():
    return {"ok": True, "message": "Backend running"}


# ── Register all routers ───────────────────────────────────────────────────
app.include_router(weather.router)
app.include_router(ml.router)
app.include_router(alerts.router)
app.include_router(sensor.router)
app.include_router(dashboard.router)