# Data Contract (agreed by Member 1 and Member 2)

Change this file only after telling your teammate.
Table names follow Member 2's `backend/schema.sql`: shipments, prescriptions, decisions, outcomes.
If a column name in schema.sql differs from this file, fix this file (or the schema) so they match.

## shipments (input to the ML model)
shipment_id, supplier, route, order_qty, planned_lead_days,
supplier_reliability, port_congestion, weather_risk, delay_days, is_delayed

## Model output (ml/train.py -> predict_delay)
```json
{"delay_probability": 0.96, "predicted_delay_days": 7}
```

## prescriptions (solver output -> API -> UI cards)
Solver: `ml/solver.py -> prescribe(shipment, predicted_delay_days, budget)` returns a list of 3:
```json
{
  "option": "A",
  "name": "Air Freight",
  "est_cost": 11000.0,
  "days_saved": 7.0,
  "risk": 0.1,
  "residual_delay_days": 0.0,
  "fraction_used": 1.0,
  "total_cost": 11000.0
}
```
Options: A = Air Freight, B = Secondary Supplier (+10%), C = Delay Product Launch.
`est_cost` never exceeds the budget (proved by `ml/test_solver.py`).
Required fields: option, name, est_cost, days_saved, risk. The rest are optional extras for the UI.

## decisions (written by POST /decisions when "Execute Decision" is clicked)
id, shipment_id, option, predicted_cost (= est_cost of the chosen option), created_at
`option` should be the letter A, B or C.

## outcomes (filled in later, used by ml/evaluate.py)
id, decision_id (references decisions.id), actual_cost, actual_delay_days, recorded_at

## Column name notes (from backend/schema.sql)
- Every table uses `id` as its primary key (shipments.id, decisions.id, ...)
- ml/shipments.csv uses `shipment_id`. When loading it into the database, map it to `shipments.id`.

## Closed loop
evaluate.py compares decisions.predicted_cost with outcomes.actual_cost,
writes cost multipliers to `ml/solver_weights.json` (e.g. {"A": 1.2}),
and retrain.py retrains XGBoost when the error is above a threshold.

## Ownership
- Member 1: ml/ (data, XGBoost, solver, evaluation, retraining)
- Member 2: backend/, frontend/ (database, FastAPI, dashboard, write-back)