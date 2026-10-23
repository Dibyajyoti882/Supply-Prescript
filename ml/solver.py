"""Prescriptive solver for SupplyPrescript (Member1).

Given a predicted delay, solve a small Linear Program (scipy.optimize.linprog)
for each recovery option and return three prescriptions: A, B, C.

For each option o we choose x in [0, 1] = how much of the option we use:
    spend         = x * full_cost_o
    days_saved    = x * full_days_saved_o
    residual_days = delay - days_saved                  (minimised by the LP)
    HARD CONSTRAINT: spend <= budget                    (never violated)
The LP recovers as many days as the budget allows for each option, so A, B and C
are always real alternatives. They are then ranked by
    total_cost = spend + STOCKOUT_PENALTY * residual_days.

Option C (delay launch) absorbs the delay by moving the launch date instead.
"""
import json
import os
from dataclasses import dataclass

import numpy as np
from scipy.optimize import linprog

WEIGHTS_PATH = "ml/solver_weights.json"  # written by evaluate.py / retrain.py later


@dataclass
class Config:
    budget: float = 20000.0               # hard budget limit ($)
    unit_value: float = 50.0              # $ value of one unit ordered
    air_base_cost: float = 5000.0         # fixed air freight cost ($)
    air_cost_per_unit: float = 3.0        # extra air freight cost per unit ($)
    air_max_days_saved: float = 12.0
    supplier_premium: float = 0.10        # option B: 10% premium on order value
    supplier_max_days_saved: float = 8.0
    stockout_penalty_per_day: float = 1200.0   # cost of each late day still remaining
    launch_penalty_per_day: float = 900.0      # option C: cost of each day launch is moved
    risk_air: float = 0.10
    risk_supplier: float = 0.20
    risk_launch: float = 0.05


def load_weights(path=WEIGHTS_PATH):
    """Cost multipliers learned from past outcomes, e.g. {"A": 1.2} if air cost 20% more."""
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def _option_params(delay, order_qty, cfg, weights):
    """Return {option: (name, full_cost, full_days_saved, risk)}."""
    air_cost = (cfg.air_base_cost + cfg.air_cost_per_unit * order_qty) * weights.get("A", 1.0)
    sup_cost = (cfg.supplier_premium * cfg.unit_value * order_qty) * weights.get("B", 1.0)
    launch_cost = (delay * cfg.launch_penalty_per_day) * weights.get("C", 1.0)
    return {
        "A": ("Air Freight", air_cost, min(delay, cfg.air_max_days_saved), cfg.risk_air),
        "B": ("Secondary Supplier (+10%)", sup_cost, min(delay, cfg.supplier_max_days_saved), cfg.risk_supplier),
        "C": ("Delay Product Launch", launch_cost, delay, cfg.risk_launch),
    }


def solve_option(delay, full_cost, full_days_saved, cfg, budget):
    """Solve the LP for one option. Returns x in [0, 1]."""
    if delay <= 0 or full_days_saved <= 0:
        return 0.0
    # minimise residual delay  <=>  maximise days saved = full_days_saved * x
    c = [-full_days_saved]
    res = linprog(
        c,
        A_ub=[[full_cost]], b_ub=[budget],   # spend <= budget (hard constraint)
        bounds=[(0, 1)],
        method="highs",
    )
    return float(res.x[0]) if res.success else 0.0


def prescribe(shipment, predicted_delay_days, budget=None, cfg=None, weights=None):
    """Return the 3 prescriptions (A, B, C), sorted by total cost (best first).

    shipment: dict with at least "order_qty".
    Each item: option, name, est_cost, days_saved, risk  (+ extra info for the UI).
    """
    cfg = cfg or Config()
    budget = cfg.budget if budget is None else budget
    weights = load_weights() if weights is None else weights
    delay = max(0.0, float(predicted_delay_days))
    qty = float(shipment.get("order_qty", 0))

    results = []
    for opt, (name, full_cost, full_saved, risk) in _option_params(delay, qty, cfg, weights).items():
        x = solve_option(delay, full_cost, full_saved, cfg, budget)
        spend = float(np.floor(min(x * full_cost, budget) * 100) / 100)  # never above budget
        saved = x * full_saved
        residual = max(0.0, delay - saved)
        results.append({
            "option": opt,
            "name": name,
            "est_cost": round(spend, 2),
            "days_saved": round(saved, 1),
            "risk": risk,
            "residual_delay_days": round(residual, 1),
            "fraction_used": round(x, 3),
            "total_cost": round(spend + cfg.stockout_penalty_per_day * residual, 2),
        })
    return sorted(results, key=lambda r: r["total_cost"])


if __name__ == "__main__":
    shipment = {"order_qty": 2000}
    try:
        from train import predict_delay
        ex = {"supplier": "SUP_B", "route": "SEA", "order_qty": 2000, "planned_lead_days": 30,
              "supplier_reliability": 0.7, "port_congestion": 0.9, "weather_risk": 0.8}
        pred = predict_delay(ex)
        delay = pred["predicted_delay_days"]
        print("Model prediction:", pred)
    except Exception:
        delay = 14  # fallback if models are not trained yet
        print("Models not found, using a 14-day delay example")

    print(f"\nPrescriptions for a {delay}-day delay (budget ${Config().budget:,.0f}):")
    for r in prescribe(shipment, delay):
        print(r)