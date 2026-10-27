# SupplyPrescript: Closed-Loop Prescriptive Analytics

Most supply chain tools only **predict** what will happen (for example, "this shipment will be 14 days late"). The manager still has to decide what to do, and the system never checks whether the decision worked.

SupplyPrescript closes that gap:

1. **Predict** the delay with XGBoost.
2. **Prescribe** the best actions with a linear optimization solver, under a hard budget limit.
3. **Write back** the manager's decision to the database from the dashboard.
4. **Learn** by comparing the predicted cost with the actual cost, then correcting the solver and retraining the model.

## Team

| Member | Role | Folders | Branch |
|---|---|---|---|
| Member 1 (Dibyajyoti) | ML and Optimization | `ml/` | `Member1-mock-data` |
| Member 2 | Database, API and Dashboard | `backend/`, `frontend/` | `Member2-db-schema` |

## Project Structure

```
Supply-Prescript/
├── backend/                 # Member 2
│   ├── schema.sql           # tables: shipments, prescriptions, decisions, outcomes
│   ├── db.py                # PostgreSQL connection (psycopg + python-dotenv)
│   ├── main.py              # FastAPI app (home and health endpoints)
│   ├── test_db.py           # checks the database connection
│   └── .env.example         # sample database settings
├── ml/                      # Member 1
│   ├── data_gen.py          # mock shipment data (5,000 rows)
│   ├── train.py             # XGBoost delay models + predict_delay()
│   ├── solver.py            # prescriptions A/B/C with a hard budget constraint
│   ├── test_solver.py       # budget audit (1,000 random scenarios)
│   ├── mock_decisions.py    # fake past decisions for testing the loop
│   ├── evaluate.py          # closed loop: predicted vs actual cost
│   └── test_evaluate.py     # tests for the closed loop
├── docs/
│   ├── data_contract.md     # shared formats between ML and backend
│   └── WORK_DIVISION.md     # task split and progress
├── frontend/                # dashboard (not started)
├── requirements.txt
└── README.md
```

## What Is Done So Far

### ML and Optimization (Member 1)

- **Mock data:** `data_gen.py` creates 5,000 shipments with supplier, route, order quantity, lead time, supplier reliability, port congestion and weather risk. About 25% of them are delayed.
- **Prediction:** `train.py` trains two XGBoost models, one for "will it be delayed" and one for "how many days late". It saves them to `ml/models/` and provides `predict_delay()` for the solver and the API.
- **Prescription:** `solver.py` takes the predicted delay and uses SciPy `linprog` to build three options:
  - **A:** Air Freight
  - **B:** Secondary Supplier (+10% premium)
  - **C:** Delay Product Launch

  The budget is a hard constraint, so no option can cost more than it. The options are ranked by total cost, including the penalty for any delay that remains.
- **Audit:** `test_solver.py` runs 1,000 random scenarios and checks that the cost never goes above the budget. 7 tests pass.
- **Closed loop:** `evaluate.py` compares the predicted cost with the actual cost of each decision. It saves corrections to `ml/solver_weights.json` (the solver reads them) and sets a `needs_retrain` flag when the overall error is above 15%. 6 tests pass.

### Model Results (mock data)

| Model | Metric | Result |
|---|---|---|
| Delay classifier | Accuracy | about 0.88 |
| Delay classifier | ROC-AUC | about 0.94 |
| Delay regressor | MAE | about 0.85 days |

Example of the closed loop on mock decisions: air freight cost 20% more than predicted, so its cost weight went from 1.00 to 1.10, and the solver's next air freight estimate became higher.

### Database and Backend (Member 2)

- PostgreSQL 17 installed and the `supply_prescript` database created
- Four tables created from `schema.sql`: `shipments`, `prescriptions`, `decisions`, `outcomes`
- Database connection through environment variables, verified with `test_db.py`
- FastAPI app with home and health-check endpoints

## Setup

```powershell
git clone https://github.com/Dibyajyoti882/Supply-Prescript.git
cd Supply-Prescript
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Backend: copy `backend/.env.example` to `backend/.env`, fill in your PostgreSQL details, then run `backend/schema.sql` in pgAdmin.

## How to Run the ML Part

Run all commands from the project root.

```powershell
python ml/data_gen.py          # creates ml/shipments.csv
python ml/train.py             # trains and saves the models
python ml/solver.py            # prints the 3 options for an example delay
python ml/test_solver.py       # budget audit
python ml/mock_decisions.py    # fake past decisions
python ml/evaluate.py          # closed loop (add --db to read from PostgreSQL)
python ml/test_evaluate.py     # closed loop tests
```

## How the Parts Connect

```
shipment data -> XGBoost (predict delay) -> solver (options A/B/C, within budget)
      -> dashboard (manager clicks Execute Decision) -> INSERT into decisions
      -> later: actual cost saved in outcomes -> evaluate.py (error + new cost weights)
      -> retrain.py (when error is high) -> better predictions next time
```

The exact formats are in `docs/data_contract.md`.

## Progress

| Week | Task | Status |
|---|---|---|
| 1 | Mock data, XGBoost model | Done |
| 1 | PostgreSQL, tables, connection, FastAPI skeleton | Done |
| 2 | Solver with budget constraint | Done |
| Mid review | Optimization audit | Done |
| 2 | Prescription endpoint and UI cards | Pending |
| Mid review | Execute Decision button (INSERT) | Pending |
| 3 | Closed-loop evaluation | Done (works on mock data) |
| 3 | Connect evaluation to PostgreSQL, Decision ROI page | Pending |
| 4 | Retraining pipeline | Pending |
| 4 | UI polish and final demo | Pending |

## Git Workflow

- `main` always holds working code. Never push straight to `main`.
- Each member works on their own branch: branch, commit, push, Pull Request, review, merge.
- Commit messages: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- Never commit `.env`, passwords, model files or large CSVs.

## Tech Stack

Python, XGBoost, SciPy, pandas, scikit-learn, PostgreSQL, FastAPI, psycopg, with Retool or React planned for the dashboard.
