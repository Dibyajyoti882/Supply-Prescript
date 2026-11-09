
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.db import get_connection
from ml.train import predict_delay
from ml.service import get_prescriptions, get_evaluation_report
from ml.evaluate import main as run_evaluation


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
    actual_delay_days: int = Field(ge=0)


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
    return {
        "message": "Welcome to Supply Prescript API"
    }


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


# XGBoost shipment delay prediction
@app.get("/predict/{shipment_id}")
def predict_shipment(shipment_id: int):
    try:
        shipment = fetch_shipment(shipment_id)

        if shipment is None:
            raise HTTPException(
                status_code=404,
                detail="Shipment not found",
            )

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


# ML prediction + Prescriptive Service
@app.get("/prescriptions/{shipment_id}")
def get_prescription(
    shipment_id: int,
    budget: float = Query(default=None, ge=0),
):
    try:
        shipment = fetch_shipment(shipment_id)

        if shipment is None:
            raise HTTPException(
                status_code=404,
                detail="Shipment not found",
            )

        result = get_prescriptions(
            shipment,
            budget=budget,
        )

        options = result["options"]

        if not options:
            raise HTTPException(
                status_code=500,
                detail="No prescription options generated",
            )

        return {
            "shipment_id": result["shipment_id"],
            "supplier": shipment["supplier"],
            "route": shipment["route"],
            "budget": result["budget"],
            "prediction": result["prediction"],
            "recommendation": options[0],
            "options": options,
            "message": "Prediction and prescriptions generated successfully",
        }

    except HTTPException:
        raise

    except FileNotFoundError as e:
        print("Prescription model error:", repr(e))

        raise HTTPException(
            status_code=503,
            detail="ML models are unavailable. Train the models first.",
        )

    except ValueError as e:
        print("Prescription input error:", repr(e))

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except Exception as e:
        print("GET /prescriptions error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to generate prescriptions",
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


# Save an outcome and automatically update evaluation report
@app.post("/outcomes")
def create_outcome(outcome: OutcomeRequest):
    conn = None

    try:
        conn = get_connection()

        with conn.cursor() as cur:

            # Check whether the decision exists
            cur.execute(
                "SELECT id FROM decisions WHERE id = %s;",
                (outcome.decision_id,),
            )

            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=404,
                    detail="Decision not found",
                )

            # Save actual cost and actual delay
            cur.execute(
                """
                INSERT INTO outcomes (
                    decision_id,
                    actual_cost,
                    actual_delay_days,
                    recorded_at
                )
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
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
                    outcome.actual_delay_days,
                ),
            )

            row = cur.fetchone()
            conn.commit()

            saved_outcome = {
                "id": row[0],
                "decision_id": row[1],
                "actual_cost": (
                    float(row[2]) if row[2] is not None else None
                ),
                "actual_delay_days": row[3],
                "recorded_at": (
                    row[4].isoformat() if row[4] else None
                ),
            }

        # Automatically regenerate evaluation report
        # The outcome is already committed before evaluation starts.
        evaluation_updated = False
        evaluation_error = None

        try:
            report = run_evaluation(use_db=True)
            evaluation_updated = True

            print(
                "Automatic evaluation completed:",
                report["total_decisions"],
                "decisions evaluated",
            )

        except Exception as evaluation_exception:
            evaluation_error = str(evaluation_exception)

            print(
                "Automatic evaluation failed:",
                repr(evaluation_exception),
            )

        return {
            "message": "Outcome saved successfully",
            "outcome": saved_outcome,
            "evaluation_updated": evaluation_updated,
            "evaluation_error": evaluation_error,
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
                    "actual_delay_days": row[3],
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


# Get Decision ROI evaluation report
@app.get("/evaluation-report")
def get_roi_report():
    try:
        report = get_evaluation_report()

        if report is None:
            return {
                "message": "Evaluation report is not available yet.",
                "report": None,
            }

        return {
            "message": "Evaluation report retrieved successfully",
            "report": report,
        }

    except Exception as e:
        print("GET /evaluation-report error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve evaluation report",
        )
