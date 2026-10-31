from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend.db import get_connection

app = FastAPI(
    title="Supply Prescript API",
    description="Supply chain prediction and decision support system",
    version="1.0.0",
)

# Allow the Next.js frontend to communicate with FastAPI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request models
class DecisionRequest(BaseModel):
    shipment_id: int
    option: str = Field(pattern="^[ABC]$")
    predicted_cost: float = Field(ge=0)


class OutcomeRequest(BaseModel):
    decision_id: int
    actual_cost: float = Field(ge=0)


# Home
@app.get("/")
def home():
    return {"message": "Welcome to Supply Prescript API"}


# Health check
@app.get("/health")
def health_check():
    return {"status": "ok"}


# Get all shipments
@app.get("/shipments")
def get_shipments():
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id AS shipment_id,
                    supplier,
                    route,
                    order_qty,
                    planned_lead_days,
                    supplier_reliability,
                    port_congestion,
                    weather_risk,
                    delay_days,
                    is_delayed
                FROM shipments
                ORDER BY id;
            """)

            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

            return [
                dict(zip(columns, row))
                for row in rows
            ]

    except Exception as e:
        print("GET /shipments error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve shipments",
        )

    finally:
        if conn is not None:
            conn.close()


# Shipment delay risk assessment
@app.get("/predict/{shipment_id}")
def predict_shipment(shipment_id: int):
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    supplier,
                    route,
                    planned_lead_days,
                    supplier_reliability,
                    port_congestion,
                    weather_risk,
                    delay_days,
                    is_delayed
                FROM shipments
                WHERE id = %s;
                """,
                (shipment_id,),
            )

            row = cur.fetchone()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail="Shipment not found",
                )

            (
                sid,
                supplier,
                route,
                planned_lead_days,
                reliability,
                congestion,
                weather,
                delay_days,
                is_delayed,
            ) = row

            reliability = float(reliability or 0)
            congestion = float(congestion or 0)
            weather = float(weather or 0)

            # Rule-based risk score.
            # Assumes all three input values are between 0 and 1.
            risk_score = (
                (1 - min(max(reliability, 0), 1)) * 40
                + min(max(congestion, 0), 1) * 30
                + min(max(weather, 0), 1) * 30
            )

            if risk_score >= 60:
                risk_level = "High"
            elif risk_score >= 30:
                risk_level = "Medium"
            else:
                risk_level = "Low"

            return {
                "shipment_id": sid,
                "supplier": supplier,
                "route": route,
                "planned_lead_days": planned_lead_days,
                "risk_score": round(risk_score, 2),
                "risk_level": risk_level,
                "historical_delay_days": delay_days,
                "historically_delayed": is_delayed,
                "method": "Rule-based risk score; not an ML prediction",
            }

    except HTTPException:
        raise

    except Exception as e:
        print("GET /predict error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to assess shipment risk",
        )

    finally:
        if conn is not None:
            conn.close()


# Save a decision
@app.post("/decisions")
def create_decision(decision: DecisionRequest):
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO decisions
                    (shipment_id, option, predicted_cost, created_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                RETURNING
                    id,
                    shipment_id,
                    option,
                    predicted_cost,
                    created_at;
                """,
                (
                    decision.shipment_id,
                    decision.option,
                    decision.predicted_cost,
                ),
            )

            row = cur.fetchone()
            conn.commit()

            return {
                "message": "Decision saved successfully",
                "decision": {
                    "id": row[0],
                    "shipment_id": row[1],
                    "option": row[2],
                    "predicted_cost": float(row[3]),
                    "created_at": (
                        row[4].isoformat()
                        if row[4]
                        else None
                    ),
                },
            }

    except Exception as e:
        if conn is not None:
            conn.rollback()

        print("POST /decisions error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to save decision. Check backend terminal.",
        )

    finally:
        if conn is not None:
            conn.close()


# Get saved decisions
@app.get("/decisions")
def get_decisions():
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id,
                    shipment_id,
                    option,
                    predicted_cost,
                    created_at
                FROM decisions
                ORDER BY created_at DESC, id DESC;
            """)

            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

            return [
                {
                    **dict(zip(columns, row)),
                    "predicted_cost": (
                        float(row[3])
                        if row[3] is not None
                        else None
                    ),
                    "created_at": (
                        row[4].isoformat()
                        if row[4]
                        else None
                    ),
                }
                for row in rows
            ]

    except Exception as e:
        print("GET /decisions error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve decisions",
        )

    finally:
        if conn is not None:
            conn.close()


# Save an outcome
@app.post("/outcomes")
def create_outcome(outcome: OutcomeRequest):
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            # Check whether the decision exists.
            cur.execute(
                "SELECT id FROM decisions WHERE id = %s;",
                (outcome.decision_id,),
            )

            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=404,
                    detail="Decision not found",
                )

            cur.execute(
                """
                INSERT INTO outcomes (
                    decision_id,
                    actual_cost,
                    recorded_at
                )
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                RETURNING
                    id,
                    decision_id,
                    actual_cost,
                    actual_delay_days,
                    recorded_at;
                """,
                (
                    outcome.decision_id,
                    outcome.actual_cost,
                ),
            )

            row = cur.fetchone()
            conn.commit()

            return {
                "message": "Outcome saved successfully",
                "outcome": {
                    "id": row[0],
                    "decision_id": row[1],
                    "actual_cost": (
                        float(row[2])
                        if row[2] is not None
                        else None
                    ),
                    "actual_delay_days": row[3],
                    "recorded_at": (
                        row[4].isoformat()
                        if row[4]
                        else None
                    ),
                },
            }

    except HTTPException:
        raise

    except Exception as e:
        if conn is not None:
            conn.rollback()

        print("POST /outcomes error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to save outcome. Check backend terminal.",
        )

    finally:
        if conn is not None:
            conn.close()


# Get saved outcomes
@app.get("/outcomes")
def get_outcomes():
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    id,
                    decision_id,
                    actual_cost,
                    actual_delay_days,
                    recorded_at
                FROM outcomes
                ORDER BY recorded_at DESC, id DESC;
            """)

            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

            return [
                {
                    **dict(zip(columns, row)),
                    "actual_cost": (
                        float(row[2])
                        if row[2] is not None
                        else None
                    ),
                    "recorded_at": (
                        row[4].isoformat()
                        if row[4]
                        else None
                    ),
                }
                for row in rows
            ]

    except Exception as e:
        print("GET /outcomes error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve outcomes",
        )

    finally:
        if conn is not None:
            conn.close()