"""Tests for the backend entry point. Run: python ml/test_service.py (or pytest)."""
import json
import os
import sys
import tempfile
from decimal import Decimal

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train as T  # noqa: E402
from service import get_evaluation_report, get_prescriptions  # noqa: E402


def _train_small_model(model_dir):
    rng = np.random.default_rng(0)
    n = 600
    df = pd.DataFrame({
        "supplier": rng.choice(["SUP_A", "SUP_B"], n),
        "route": rng.choice(["SEA", "AIR", "ROAD"], n),
        "order_qty": rng.integers(100, 5000, n),
        "planned_lead_days": rng.integers(5, 45, n),
        "supplier_reliability": rng.uniform(0.6, 1.0, n).round(2),
        "port_congestion": rng.uniform(0, 1, n).round(2),
        "weather_risk": rng.uniform(0, 1, n).round(2),
    })
    delay = (15 * (1 - df["supplier_reliability"]) + 8 * df["port_congestion"]
             + 6 * df["weather_risk"] - 9 + rng.normal(0, 1.5, n))
    df["delay_days"] = delay.clip(lower=0).round().astype(int)
    df["is_delayed"] = (df["delay_days"] > 3).astype(int)
    T.train(df, model_dir=model_dir)


SHIPMENT = {"id": 17, "supplier": "SUP_B", "route": "SEA", "order_qty": 2000,
            "planned_lead_days": 30, "supplier_reliability": Decimal("0.70"),
            "port_congestion": Decimal("0.90"), "weather_risk": Decimal("0.80"),
            "delay_days": None, "is_delayed": None}      # extra DB columns are ignored


def test_returns_prediction_and_three_options_within_budget():
    with tempfile.TemporaryDirectory() as d:
        _train_small_model(d)
        res = get_prescriptions(SHIPMENT, budget=12000, model_dir=d, weights_path=f"{d}/none.json")
        assert res["shipment_id"] == 17
        assert 0 <= res["prediction"]["delay_probability"] <= 1
        assert sorted(o["option"] for o in res["options"]) == ["A", "B", "C"]
        assert all(o["est_cost"] <= 12000 for o in res["options"])


def test_missing_field_gives_clear_error():
    bad = {k: v for k, v in SHIPMENT.items() if k != "route"}
    try:
        get_prescriptions(bad)
    except ValueError as e:
        assert "route" in str(e)
    else:
        raise AssertionError("expected ValueError")


def test_evaluation_report_missing_and_present():
    with tempfile.TemporaryDirectory() as d:
        assert get_evaluation_report(f"{d}/nope.json") is None
        with open(f"{d}/r.json", "w") as f:
            json.dump({"needs_retrain": False}, f)
        assert get_evaluation_report(f"{d}/r.json") == {"needs_retrain": False}


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")