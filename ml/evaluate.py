"""The Closed Loop (Week 3, Member1).

Compares the PREDICTED cost of each executed decision with the ACTUAL cost,
then learns from the difference:
  1. per-option error report            -> ml/evaluation_report.json
  2. updated cost multipliers for solver -> ml/solver_weights.json
  3. a flag telling retrain.py whether the models need retraining

Run:
    python ml/evaluate.py            # uses ml/mock_decisions.csv
    python ml/evaluate.py --db       # reads decisions + outcomes from PostgreSQL
"""
import json
import os
import sys

import pandas as pd

MOCK_PATH = "ml/mock_decisions.csv"
WEIGHTS_PATH = "ml/solver_weights.json"
REPORT_PATH = "ml/evaluation_report.json"

LEARNING_RATE = 0.5        # how strongly one evaluation moves the weights (0..1)
MIN_SAMPLES = 5            # do not change a weight with fewer decisions than this
WEIGHT_MIN, WEIGHT_MAX = 0.5, 2.0
SUCCESS_TOLERANCE = 0.10   # decision is a "success" if actual <= predicted * 1.10
RETRAIN_THRESHOLD = 0.15   # overall error above 15% -> retrain.py should run

# ---- Matches Member 2's backend/schema.sql (decisions.id, outcomes.decision_id) ----
DB_QUERY = """
    SELECT d.id AS decision_id, d.shipment_id, d.option, d.predicted_cost, o.actual_cost
    FROM decisions d
    JOIN outcomes o ON o.decision_id = d.id
    WHERE o.actual_cost IS NOT NULL
"""


def normalize_option(value):
    """Accept 'A', 'a', 'Option A', 'Air Freight' ... and return 'A', 'B' or 'C'."""
    v = str(value).strip().upper()
    if v in ("A", "B", "C"):
        return v
    if v.startswith("OPTION ") and v[-1] in "ABC":
        return v[-1]
    if "AIR" in v:
        return "A"
    if "SUPPLIER" in v or "SECONDARY" in v:
        return "B"
    if "LAUNCH" in v or "DELAY" in v:
        return "C"
    return v


def load_from_csv(path=MOCK_PATH):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} not found. Run: python ml/mock_decisions.py")
    return pd.read_csv(path)


def connect_db():
    """Open a PostgreSQL connection (psycopg v3, settings from backend/.env)."""
    import psycopg
    from dotenv import load_dotenv

    load_dotenv("backend/.env")
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "supply_prescript"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
    )


def load_from_db():
    """Read finished decisions from PostgreSQL."""
    conn = connect_db()
    with conn, conn.cursor() as cur:
        cur.execute(DB_QUERY)
        cols = [c.name for c in cur.description]
        df = pd.DataFrame(cur.fetchall(), columns=cols)
    for c in ("predicted_cost", "actual_cost"):
        df[c] = df[c].astype(float)
    return df


def load_weights(path=WEIGHTS_PATH):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def evaluate(df, current_weights=None):
    """Return (report, new_weights). Pure function, easy to test."""
    current_weights = dict(current_weights or {})
    df = df[df["predicted_cost"] > 0].copy()
    df["option"] = df["option"].map(normalize_option)
    df["error"] = df["actual_cost"] - df["predicted_cost"]
    df["pct_error"] = df["error"] / df["predicted_cost"]
    df["success"] = df["actual_cost"] <= df["predicted_cost"] * (1 + SUCCESS_TOLERANCE)

    new_weights = dict(current_weights)
    per_option = {}
    for opt, g in df.groupby("option"):
        mean_pct = float(g["pct_error"].mean())
        old_w = float(current_weights.get(opt, 1.0))
        new_w = old_w
        if len(g) >= MIN_SAMPLES:
            new_w = old_w * (1 + LEARNING_RATE * mean_pct)
            new_w = min(WEIGHT_MAX, max(WEIGHT_MIN, new_w))
            new_weights[opt] = round(new_w, 4)
        per_option[opt] = {
            "decisions": int(len(g)),
            "avg_predicted_cost": round(float(g["predicted_cost"].mean()), 2),
            "avg_actual_cost": round(float(g["actual_cost"].mean()), 2),
            "mean_pct_error": round(mean_pct, 4),
            "mean_abs_error_usd": round(float(g["error"].abs().mean()), 2),
            "success_rate": round(float(g["success"].mean()), 3),
            "old_weight": round(old_w, 4),
            "new_weight": round(new_w, 4),
        }

    overall_mape = float(df["pct_error"].abs().mean()) if len(df) else 0.0
    report = {
        "total_decisions": int(len(df)),
        "overall_abs_pct_error": round(overall_mape, 4),
        "overall_success_rate": round(float(df["success"].mean()), 3) if len(df) else 0.0,
        "needs_retrain": bool(overall_mape > RETRAIN_THRESHOLD),
        "per_option": per_option,
    }
    return report, new_weights


def main(use_db=False):
    df = load_from_db() if use_db else load_from_csv()
    report, new_weights = evaluate(df, load_weights())

    with open(WEIGHTS_PATH, "w") as f:
        json.dump(new_weights, f, indent=2)
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Evaluated {report['total_decisions']} decisions")
    print(f"Overall error: {report['overall_abs_pct_error']:.1%} | "
          f"success rate: {report['overall_success_rate']:.1%} | "
          f"needs retrain: {report['needs_retrain']}\n")
    for opt, s in sorted(report["per_option"].items()):
        print(f"Option {opt}: predicted ${s['avg_predicted_cost']:,.0f} vs actual "
              f"${s['avg_actual_cost']:,.0f} ({s['mean_pct_error']:+.1%}) "
              f"-> weight {s['old_weight']} -> {s['new_weight']}")
    print(f"\nSaved {WEIGHTS_PATH} and {REPORT_PATH}")
    return report


if __name__ == "__main__":
    main(use_db="--db" in sys.argv)