"""Tests for the retraining pipeline. Run: python ml/test_retrain.py (or pytest)."""
import os
import sys
import tempfile

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retrain import apply_outcomes, retrain, should_promote  # noqa: E402


def _make_df(n=800, seed=0):
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({
        "shipment_id": range(1, n + 1),
        "supplier": rng.choice(["SUP_A", "SUP_B", "SUP_C"], n),
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
    return df


def test_skipped_when_no_drift():
    with tempfile.TemporaryDirectory() as d:
        res = retrain(_make_df(), {"needs_retrain": False}, model_dir=d, log_path=f"{d}/log.json")
        assert res["status"] == "skipped"
        assert not os.listdir(d)          # nothing was trained or saved


def test_retrains_when_drift_detected():
    with tempfile.TemporaryDirectory() as d:
        res = retrain(_make_df(), {"needs_retrain": True}, model_dir=d, log_path=f"{d}/log.json")
        assert res["status"] == "promoted"
        assert os.path.exists(f"{d}/delay_classifier.joblib")
        assert os.path.exists(f"{d}/log.json")


def test_force_retrain_and_old_model_is_archived():
    with tempfile.TemporaryDirectory() as d:
        retrain(_make_df(), {"needs_retrain": True}, model_dir=d, log_path=f"{d}/log.json")
        res = retrain(_make_df(seed=1), {"needs_retrain": False}, force=True,
                      model_dir=d, log_path=f"{d}/log.json")
        assert res["status"] in ("promoted", "rejected")
        assert res["old_scores"] is not None
        if res["status"] == "promoted":
            assert os.path.isdir(f"{d}/archive")


def test_should_promote_rules():
    assert should_promote(None, 5.0)            # no old model
    assert should_promote(1.0, 0.9)             # better
    assert should_promote(1.0, 1.01)            # within tolerance
    assert not should_promote(1.0, 1.5)         # clearly worse


def test_apply_outcomes_uses_actual_delay():
    df = _make_df(50)
    outcomes = pd.DataFrame({"shipment_id": [1, 2], "actual_delay_days": [10, 0]})
    out = apply_outcomes(df, outcomes)
    assert out.loc[out.shipment_id == 1, "delay_days"].iloc[0] == 10
    assert out.loc[out.shipment_id == 1, "is_delayed"].iloc[0] == 1
    assert out.loc[out.shipment_id == 2, "is_delayed"].iloc[0] == 0
    assert (out.loc[out.shipment_id > 2, "delay_days"] == df.loc[df.shipment_id > 2, "delay_days"]).all()


def test_apply_outcomes_with_no_outcomes_changes_nothing():
    df = _make_df(20)
    pd.testing.assert_frame_equal(apply_outcomes(df, pd.DataFrame()), df)


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")