import pandas as pd
from backend.db import get_connection

CSV_PATH = "ml/shipments.csv"


def load_shipments():
    df = pd.read_csv(CSV_PATH)
    conn = get_connection()

    try:
        with conn.cursor() as cur:
            for _, row in df.iterrows():
                cur.execute(
                    """
                    INSERT INTO shipments (
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
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (
                        int(row["shipment_id"]),
                        row["supplier"],
                        row["route"],
                        int(row["order_qty"]),
                        int(row["planned_lead_days"]),
                        float(row["supplier_reliability"]),
                        float(row["port_congestion"]),
                        float(row["weather_risk"]),
                        int(row["delay_days"]),
                        bool(row["is_delayed"]),
                    ),
                )

        conn.commit()
        print("Shipment data loaded successfully!")
        print(f"Total CSV records: {len(df)}")

    except Exception as e:
        conn.rollback()
        print("Error loading shipment data:", e)
        raise

    finally:
        conn.close()


if __name__ == "__main__":
    load_shipments()