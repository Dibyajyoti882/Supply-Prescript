"""One entry point for the backend (Member1).

Member 2's FastAPI code calls these functions, so the API never needs to know
how the model or the solver work inside.

    from ml.service import get_prescriptions, get_evaluation_report

    result = get_prescriptions(shipment_row, budget=20000)
    # {
    #   "shipment_id": 17,
    #   "budget": 20000,
    #   "prediction": {"delay_probability": 0.96, "predicted_delay_days": 7},
    #   "options": [ {option, name, est_cost, days_saved, risk, ...} x3 ]
    # }

Works from any folder: all file paths are based on this file's location.
Needs trained models first:  python ml/data_gen.py  &&  python ml/train.py
"""
import json
import os
from decimal import Decimal

try:                                  # imported as a package: from ml.service import ...
    from .solver import Config, load_weights, prescribe
    from .train import predict_delay
except ImportError:                   # run from inside the ml folder
    from solver import Config, load_weights, prescribe
    from train import predict_delay

ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(ML_DIR, "models")
WEIGHTS_PATH = os.path.join(ML_DIR, "solver_weights.json")
REPORT_PATH = os.path.join(ML_DIR, "evaluation_report.json")

FEATURE_KEYS = ["supplier", "route", "order_qty", "planned_lead_days",
                "supplier_reliability", "port_congestion", "weather_risk"]


def _clean(shipment):
    """Keep only the model inputs and turn database Decimals into floats."""
    row = {}
    for key in FEATURE_KEYS:
        if key not in shipment or shipment[key] is None:
            raise ValueError(f"shipment is missing '{key}'")
        value = shipment[key]
        row[key] = float(value) if isinstance(value, Decimal) else value
    return row


def get_prescriptions(shipment, budget=None, model_dir=MODEL_DIR, weights_path=WEIGHTS_PATH):
    """Predict the delay for one shipment and return options A, B and C."""
    row = _clean(shipment)
    prediction = predict_delay(row, model_dir=model_dir)
    budget = Config().budget if budget is None else float(budget)
    options = prescribe(row, prediction["predicted_delay_days"], budget=budget,
                        weights=load_weights(weights_path))
    return {
        "shipment_id": shipment.get("shipment_id", shipment.get("id")),
        "budget": budget,
        "prediction": prediction,
        "options": options,
    }


def get_evaluation_report(path=REPORT_PATH):
    """The latest closed-loop report for the Decision ROI page (None if not created yet)."""
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)