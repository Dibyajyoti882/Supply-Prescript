"""Optimization audit (Mid-Project Review): the solver must never break the budget.

Run:  python ml/test_solver.py      (or: pytest ml/test_solver.py)
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from solver import Config, prescribe  # noqa: E402


def test_budget_never_exceeded_1000_random_scenarios():
    rng = np.random.default_rng(123)
    for _ in range(1000):
        shipment = {"order_qty": int(rng.integers(100, 5000))}
        delay = float(rng.uniform(0, 30))
        budget = float(rng.uniform(0, 30000))
        for r in prescribe(shipment, delay, budget=budget, weights={}):
            assert r["est_cost"] <= budget + 1e-9, (shipment, delay, budget, r)


def test_budget_never_exceeded_with_cost_weights():
    rng = np.random.default_rng(7)
    weights = {"A": 1.5, "B": 1.3, "C": 2.0}
    for _ in range(500):
        shipment = {"order_qty": int(rng.integers(100, 5000))}
        delay = float(rng.uniform(0, 30))
        budget = float(rng.uniform(0, 30000))
        for r in prescribe(shipment, delay, budget=budget, weights=weights):
            assert r["est_cost"] <= budget + 1e-9


def test_returns_three_options_with_contract_fields():
    out = prescribe({"order_qty": 2000}, 14, weights={})
    assert sorted(r["option"] for r in out) == ["A", "B", "C"]
    for r in out:
        for key in ("option", "name", "est_cost", "days_saved", "risk"):
            assert key in r


def test_zero_budget_means_zero_spend():
    for r in prescribe({"order_qty": 2000}, 14, budget=0, weights={}):
        assert r["est_cost"] == 0


def test_no_delay_means_no_spend():
    for r in prescribe({"order_qty": 2000}, 0, weights={}):
        assert r["est_cost"] == 0 and r["days_saved"] == 0


def test_days_saved_never_exceed_delay():
    rng = np.random.default_rng(99)
    for _ in range(300):
        delay = float(rng.uniform(0, 30))
        for r in prescribe({"order_qty": 1500}, delay, weights={}):
            assert r["days_saved"] <= delay + 0.05
            assert r["residual_delay_days"] >= 0


def test_higher_cost_weight_raises_cost():
    base = {r["option"]: r for r in prescribe({"order_qty": 1000}, 10, budget=1e6, weights={})}
    heavy = {r["option"]: r for r in prescribe({"order_qty": 1000}, 10, budget=1e6, weights={"A": 1.2})}
    assert heavy["A"]["est_cost"] >= base["A"]["est_cost"]


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("PASS", t.__name__)
    print(f"\nAll {len(tests)} tests passed. Budget constraint never violated.")