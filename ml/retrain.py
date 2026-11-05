"""Continuous learning (Week 4, Member1).

When evaluate.py finds that predictions drifted from reality (needs_retrain = true),
this script retrains the XGBoost models:

  1. read ml/evaluation_report.json  (written by evaluate.py)
  2. load shipment data (CSV, or PostgreSQL with --db)
  3. with --db, replace delay values with the ACTUAL delays saved in `outcomes`
  4. train a candidate model and compare it with the current one on the same test data
  5. promote the candidate only if it is not worse; archive the old model
  6. write a line to ml/retrain_log.json

Run:
    python ml/evaluate.py && python ml/retrain.py
    python ml/retrain.py --force        # retrain even if no drift was found
    python ml/retrain.py --db           # use shipments + outcomes from PostgreSQL
"""
import json
import os
import shutil
import sys
from datetime import datetime

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402
from evaluate import REPORT_PATH, connect_db  # noqa: E402

RETRAIN_LOG = "ml/retrain_log.json"
PROMOTE_TOLERANCE = 0.02   # new model may be at most 2% worse (MAE) than the old one
DELAY_THRESHOLD_DAYS = 3   # same rule as data_gen.py: delayed if more than 3 days

SHIPMENTS_QUERY = """
    SELECT id AS shipment_id, supplier, route, order_qty, planned_lead_days,
           supplier_reliability, port_congestion, weather_risk, delay_days, is_delayed
    FROM shipments
    WHERE delay_days IS NOT NULL
"""
OUTCOMES_QUERY = """
    SELECT d.shipment_id, o.actual_delay_days
    FROM outcomes o
    JOIN decisions d ON d.id = o.decision_id
    WHERE o.actual_delay_days IS NOT NULL
"""


# ---------- data ----------
def load_shipments_from_db():
    conn = connect_db()
    with conn, conn.cursor() as cur:
        cur.execute(SHIPMENTS_QUERY)
        df = pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])
        cur.execute(OUTCOMES_QUERY)
        outcomes = pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])
    for c in ("supplier_reliability", "port_congestion", "weather_risk"):
        df[c] = df[c].astype(float)
    df["is_delayed"] = df["is_delayed"].astype(int)
    return df, outcomes


def apply_outcomes(df, outcomes):
    """Replace the delay of shipments that have a real outcome with the ACTUAL delay."""
    if outcomes is None or len(outcomes) == 0:
        return df
    actual = outcomes.groupby("shipment_id")["actual_delay_days"].last()
    df = df.copy()
    mask = df["shipment_id"].isin(actual.index)
    df.loc[mask, "delay_days"] = df.loc[mask, "shipment_id"].map(actual).astype(int)
    df.loc[mask, "is_delayed"] = (df.loc[mask, "delay_days"] > DELAY_THRESHOLD_DAYS).astype(int)
    return df


# ---------- decisions ----------
def load_report(path=REPORT_PATH):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} not found. Run: python ml/evaluate.py first")
    with open(path) as f:
        return json.load(f)


def should_promote(old_mae, new_mae, tolerance=PROMOTE_TOLERANCE):
    """Promote when there is no old model, or the new one is not clearly worse."""
    return old_mae is None or new_mae <= old_mae * (1 + tolerance)


def archive_current(model_dir):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(model_dir, "archive", stamp)
    os.makedirs(dest, exist_ok=True)
    for name in os.listdir(model_dir):
        src = os.path.join(model_dir, name)
        if os.path.isfile(src) and name.endswith(".joblib"):
            shutil.copy2(src, dest)
    return dest


def write_log(entry, path=RETRAIN_LOG):
    log = []
    if os.path.exists(path):
        with open(path) as f:
            log = json.load(f)
    log.append(entry)
    with open(path, "w") as f:
        json.dump(log, f, indent=2)


# ---------- main logic ----------
def retrain(df, report, force=False, model_dir=T.MODEL_DIR, log_path=RETRAIN_LOG):
    """Return a dict describing what happened (status: skipped / promoted / rejected)."""
    if not report.get("needs_retrain") and not force:
        return {"status": "skipped",
                "reason": f"error {report.get('overall_abs_pct_error', 0):.1%} is below the threshold"}

    X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te = T.split_data(df)
    new_clf, new_reg = T.fit_models(X_tr, yc_tr, yr_tr)
    new_scores = T.score_models(new_clf, new_reg, X_te, yc_te, yr_te)

    old_scores = None
    loaded = T.load_models(model_dir)
    if loaded is not None:
        old_clf, old_reg, old_cols = loaded
        X_old = X_te.reindex(columns=old_cols, fill_value=0)
        old_scores = T.score_models(old_clf, old_reg, X_old, yc_te, yr_te)

    promote = should_promote(old_scores["mae_days"] if old_scores else None, new_scores["mae_days"])
    archived = None
    if promote:
        if loaded is not None:
            archived = archive_current(model_dir)
        T.save_models(new_clf, new_reg, X_tr.columns, model_dir)

    result = {
        "status": "promoted" if promote else "rejected",
        "time": datetime.now().isoformat(timespec="seconds"),
        "reason": "forced" if force and not report.get("needs_retrain") else "drift detected",
        "rows_used": int(len(df)),
        "old_scores": old_scores,
        "new_scores": new_scores,
        "archived_to": archived,
    }
    write_log(result, log_path)
    return result


def main(use_db=False, force=False):
    report = load_report()
    if use_db:
        df, outcomes = load_shipments_from_db()
        df = apply_outcomes(df, outcomes)
        print(f"Loaded {len(df)} shipments and {len(outcomes)} real outcomes from PostgreSQL")
    else:
        df = T.load_data()
        print(f"Loaded {len(df)} shipments from {T.DATA_PATH}")

    result = retrain(df, report, force=force)
    print(f"\nRetrain status: {result['status']}")
    if result["status"] == "skipped":
        print("Reason:", result["reason"], "(use --force to retrain anyway)")
        return result
    old, new = result["old_scores"], result["new_scores"]
    if old:
        print(f"Old model: MAE {old['mae_days']} days, ROC-AUC {old['roc_auc']}")
    print(f"New model: MAE {new['mae_days']} days, ROC-AUC {new['roc_auc']}")
    if result["status"] == "promoted":
        print(f"New model is now in use. Old model archived to: {result['archived_to']}")
    else:
        print("New model was worse, so the current model was kept.")
    return result


if __name__ == "__main__":
    main(use_db="--db" in sys.argv, force="--force" in sys.argv)