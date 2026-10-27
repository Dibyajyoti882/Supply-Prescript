"""Make fake past decisions + outcomes so evaluate.py can be tested before the
database has real data (Member1).

Run:  python ml/mock_decisions.py   ->  ml/mock_decisions.csv
Pretend story: air freight (A) really costs about 20% more than predicted,
supplier (B) about 3% more, delaying the launch (C) about 2% less.
"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from solver import prescribe  # noqa: E402

rng = np.random.default_rng(2026)
TRUE_BIAS = {"A": 1.20, "B": 1.03, "C": 0.98}   # hidden "real world" behaviour
N = 200

rows = []
for i in range(1, N + 1):
    shipment = {"order_qty": int(rng.integers(300, 4000))}
    delay = float(rng.uniform(3, 20))
    options = prescribe(shipment, delay, weights={})         # solver without learned weights
    chosen = options[int(rng.integers(0, 3))]                # the manager picks one
    if chosen["est_cost"] <= 0:
        continue
    actual = chosen["est_cost"] * TRUE_BIAS[chosen["option"]] * rng.normal(1.0, 0.05)
    rows.append({
        "decision_id": len(rows) + 1,
        "shipment_id": i,
        "option": chosen["option"],
        "predicted_cost": chosen["est_cost"],
        "actual_cost": round(float(actual), 2),
    })

pd.DataFrame(rows).to_csv("ml/mock_decisions.csv", index=False)
print(f"Saved {len(rows)} mock decisions to ml/mock_decisions.csv")