"""
main.py — FastAPI Application Entry Point
==========================================
वन दृष्टि Fire Risk Monitoring System

Start server:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Interactive docs:
    http://localhost:8000/docs
    http://localhost:8000/redoc
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
from routers import weather, ml, alerts, sensor, dashboard


# ── Startup / shutdown ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    yield
    await database.disconnect()


# ── App instance ────────────────────────────────────────────────────────────
app = FastAPI(
    title="वन दृष्टि — Fire Risk Monitoring API",
    description=(
        "FastAPI backend for the Wildfire Risk Monitoring System.\n\n"
        "Mirrors all Express routes from `src/routes/`.\n\n"
        "**Start:** `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`\n\n"
        "**ML Analytics:** `GET /api/ml/metrics` returns training metrics + confusion matrix."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ────────────────────────────────────────────────────────────
@app.get("/check", tags=["Health"], summary="Liveness probe")
async def health_check():
    """Returns 200 OK when the server is running."""
    return {"ok": True, "message": "Backend running"}


# ── Routers ─────────────────────────────────────────────────────────────────
app.include_router(weather.router)
app.include_router(ml.router)
app.include_router(alerts.router)
app.include_router(sensor.router)
app.include_router(dashboard.router)