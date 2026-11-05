
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.db import get_connection
from ml.train import predict_delay
from ml.solver import prescribe


app = FastAPI(
    title="Supply Prescript API",
    description="Supply chain prediction and decision support system",
    version="1.0.0",
)


# CORS configuration
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


# Helper: Fetch one shipment
def fetch_shipment(shipment_id: int):
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
                    order_qty,
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
                return None

            columns = [desc.name for desc in cur.description]
            shipment = dict(zip(columns, row))

            # Convert numeric values for ML and solver.
            numeric_fields = [
                "order_qty",
                "planned_lead_days",
                "supplier_reliability",
                "port_congestion",
                "weather_risk",
                "delay_days",
            ]

            for field in numeric_fields:
                shipment[field] = float(shipment[field] or 0)

            return shipment

    finally:
        if conn is not None:
            conn.close()


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
            cur.execute(
                """
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
                """
            )

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


# ML shipment delay prediction
@app.get("/predict/{shipment_id}")
def predict_shipment(shipment_id: int):
    try:
        shipment = fetch_shipment(shipment_id)

        if shipment is None:
            raise HTTPException(
                status_code=404,
                detail="Shipment not found",
            )

        # Actual XGBoost prediction
        prediction = predict_delay(shipment)

        probability = prediction["delay_probability"]
        predicted_days = prediction["predicted_delay_days"]

        risk_score = round(probability * 100, 2)

        if probability >= 0.7:
            risk_level = "High"
        elif probability >= 0.3:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        return {
            "shipment_id": shipment["id"],
            "supplier": shipment["supplier"],
            "route": shipment["route"],
            "planned_lead_days": shipment["planned_lead_days"],
            "risk_score": risk_score,
            "risk_level": risk_level,
            "delay_probability": probability,
            "predicted_delay_days": predicted_days,
            "historical_delay_days": shipment["delay_days"],
            "historically_delayed": shipment["is_delayed"],
            "method": "XGBoost ML prediction",
        }

    except HTTPException:
        raise

    except FileNotFoundError as e:
        print("ML model error:", repr(e))

        raise HTTPException(
            status_code=503,
            detail="ML models not found. Train the models first.",
        )

    except Exception as e:
        print("GET /predict error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to predict shipment delay",
        )


# ML prediction + Prescriptive Solver
@app.get("/prescriptions/{shipment_id}")
def get_prescription(
    shipment_id: int,
    budget: float = Query(default=None, ge=0),
):
    try:
        # Step 1: Fetch shipment from database
        shipment = fetch_shipment(shipment_id)

        if shipment is None:
            raise HTTPException(
                status_code=404,
                detail="Shipment not found",
            )

        # Step 2: Predict delay using XGBoost
        prediction = predict_delay(shipment)

        predicted_days = prediction["predicted_delay_days"]

        # Step 3: Run existing prescriptive solver
        options = prescribe(
            shipment=shipment,
            predicted_delay_days=predicted_days,
            budget=budget,
        )

        if not options:
            raise HTTPException(
                status_code=500,
                detail="Solver did not return any options",
            )

        # Solver sorts options by total_cost (best first).
        best_option = options[0]

        # Step 4: Return prediction and recommendations
        return {
            "shipment_id": shipment["id"],
            "supplier": shipment["supplier"],
            "route": shipment["route"],

            "prediction": {
                "delay_probability": prediction["delay_probability"],
                "predicted_delay_days": predicted_days,
            },

            "budget": budget,

            "recommendation": best_option,

            "all_options": options,

            "message": "Prediction and prescription generated successfully",
        }

    except HTTPException:
        raise

    except FileNotFoundError as e:
        print("Model or solver file error:", repr(e))

        raise HTTPException(
            status_code=503,
            detail="Required ML models or solver weights are unavailable.",
        )

    except Exception as e:
        print("GET /prescriptions error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to generate shipment prescription",
        )


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
                    "predicted_cost": (
                        float(row[3]) if row[3] is not None else None
                    ),
                    "created_at": (
                        row[4].isoformat() if row[4] else None
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
            cur.execute(
                """
                SELECT
                    id,
                    shipment_id,
                    option,
                    predicted_cost,
                    created_at
                FROM decisions
                ORDER BY created_at DESC, id DESC;
                """
            )

            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

            return [
                {
                    **dict(zip(columns, row)),
                    "predicted_cost": (
                        float(row[3]) if row[3] is not None else None
                    ),
                    "created_at": (
                        row[4].isoformat() if row[4] else None
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
            # Check whether decision exists
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
                        float(row[2]) if row[2] is not None else None
                    ),
                    "actual_delay_days": row[3],
                    "recorded_at": (
                        row[4].isoformat() if row[4] else None
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
            cur.execute(
                """
                SELECT
                    id,
                    decision_id,
                    actual_cost,
                    actual_delay_days,
                    recorded_at
                FROM outcomes
                ORDER BY recorded_at DESC, id DESC;
                """
            )

            columns = [desc.name for desc in cur.description]
            rows = cur.fetchall()

            return [
                {
                    **dict(zip(columns, row)),
                    "actual_cost": (
                        float(row[2]) if row[2] is not None else None
                    ),
                    "recorded_at": (
                        row[4].isoformat() if row[4] else None
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