from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from db import get_connection

app = FastAPI(
    title="Supply Prescript API",
    description="Supply chain prediction and decision support system",
    version="1.0.0",
)


class DecisionRequest(BaseModel):
    shipment_id: int
    option: str
    predicted_cost: float


@app.get("/")
def home():
    return {
        "message": "Welcome to Supply Prescript API"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }


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
            detail="Unable to retrieve shipments"
        )

    finally:
        if conn is not None:
            conn.close()


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
            detail="Unable to save decision. Check backend terminal."
        )

    finally:
        if conn is not None:
            conn.close()


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
                    "predicted_cost": float(row[3]),
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
            detail="Unable to retrieve decisions"
        )

    finally:
        if conn is not None:
            conn.close()