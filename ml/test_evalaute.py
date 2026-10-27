"""Tests for the closed loop. Run: python ml/test_evaluate.py (or pytest)."""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from evaluate import MIN_SAMPLES, WEIGHT_MAX, WEIGHT_MIN, evaluate  # noqa: E402


def _df(option, predicted, actual, n=10):
    return pd.DataFrame({"option": [option] * n,
                         "predicted_cost": [predicted] * n,
                         "actual_cost": [actual] * n})


def test_underestimated_cost_raises_weight():
    # predicted 15k, actual 18k  (the example from the project brief)
    report, w = evaluate(_df("A", 15000, 18000))
    assert w["A"] > 1.0
    assert abs(report["per_option"]["A"]["mean_pct_error"] - 0.2) < 1e-9


def test_perfect_prediction_keeps_weight():
    _, w = evaluate(_df("B", 10000, 10000))
    assert abs(w["B"] - 1.0) < 1e-9


def test_overestimated_cost_lowers_weight():
    _, w = evaluate(_df("C", 10000, 8000))
    assert w["C"] < 1.0


def test_weights_are_clipped():
    _, w = evaluate(_df("A", 1000, 100000))
    assert w["A"] <= WEIGHT_MAX
    _, w = evaluate(_df("A", 100000, 1))
    assert w["A"] >= WEIGHT_MIN


def test_too_few_samples_does_not_change_weight():
    _, w = evaluate(_df("A", 15000, 18000, n=MIN_SAMPLES - 1))
    assert "A" not in w


def test_big_error_triggers_retrain_flag():
    report, _ = evaluate(_df("A", 10000, 14000))
    assert report["needs_retrain"] is True
    report, _ = evaluate(_df("A", 10000, 10200))
    assert report["needs_retrain"] is False


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed.")