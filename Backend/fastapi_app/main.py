# main.py
# FastAPI application entry point for the Van Drishti Fire Risk Monitoring System.
# Initialises the app, registers middleware, connects to the database on startup,
# and mounts all route handlers.
#
# Start server:
#     uvicorn main:app --host 0.0.0.0 --port 8000 --reload
#
# Interactive docs:
#     http://localhost:8000/docs
#     http://localhost:8000/redoc

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database  # Provides connect() and disconnect() for the asyncpg pool
from routers import weather, ml, alerts, sensor, dashboard  # All route handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages application startup and shutdown using FastAPI's lifespan protocol.
    Code before yield runs once when the server starts.
    Code after yield runs once when the server stops.
    This replaces the older @app.on_event("startup") and @app.on_event("shutdown") approach.
    """
    await database.connect()    # Open the asyncpg connection pool before any requests are handled
    yield                        # Server runs and handles requests while paused here
    await database.disconnect()  # Close all pool connections cleanly when the server shuts down


app = FastAPI(
    title="Van Drishti - Fire Risk Monitoring API",
    description=(
        "FastAPI backend for the Wildfire Risk Monitoring System.\n\n"
        "Mirrors all Express routes from src/routes/.\n\n"
        "Start: uvicorn main:app --host 0.0.0.0 --port 8000 --reload\n\n"
        "ML Analytics: GET /api/ml/metrics returns training metrics and confusion matrix."
    ),
    version="1.0.0",
    lifespan=lifespan,  # Register the lifespan handler defined above
)

# Allow requests from any origin, with any method and any headers.
# This is intentionally permissive for the FastAPI backend since access control
# is handled at the Express layer and by the x-admin-key header check in routes.
# Tighten this to specific origins before exposing the FastAPI port publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # All origins allowed — restrict this in production
    allow_methods=["*"],   # All HTTP methods allowed (GET, POST, etc.)
    allow_headers=["*"],   # All request headers allowed including x-admin-key
)


@app.get("/check", tags=["Health"], summary="Liveness probe")
async def health_check():
    """
    Simple liveness endpoint used by load balancers and monitoring tools
    to verify the server process is running and accepting connections.
    Does not check database connectivity — use GET /api/weather/db-test for that.
    """
    return {"ok": True, "message": "Backend running"}


# Register all routers — each adds its own prefix defined in the router file
app.include_router(weather.router)    # /api/weather  — weather sync and retrieval
app.include_router(ml.router)         # /api/ml       — model training and predictions
app.include_router(alerts.router)     # /api/alerts   — email alerts and alert history
app.include_router(sensor.router)     # /api/sensor   — IoT device data ingestion
app.include_router(dashboard.router)  # /api/dashboard — aggregated dashboard data