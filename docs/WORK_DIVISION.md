# SupplyPrescript - Work Division and Progress

Project: Closed-Loop Prescriptive Analytics (Predict -> Prescribe -> Write-back -> Learn)

| | Member 1 (ML & Optimization) | Member 2 (Application & Data) |
|---|---|---|
| Branch | `Member1-mock-data` | `Member2-db-schema` |
| Folders owned | `ml/` | `backend/`, `frontend/` |
| Tech | Python, XGBoost, SciPy | PostgreSQL, FastAPI, Retool/React |

Legend: [x] done, [ ] pending. Update this file when a task is finished.

---

## MEMBER 1 - ML and Optimization

### Week 1: Predictive Baseline
- [x] Generate mock shipment data (`ml/data_gen.py`)
- [x] Train XGBoost to predict `is_delayed` and `delay_days` (`ml/train.py`)
- [x] Save the trained models (`ml/models/`, not committed)
- [ ] Write the accuracy / MAE results in the README

### Week 2: Mathematical Optimization
- [x] Define constraints: max budget, deadline (`Config` in `ml/solver.py`)
- [x] Write the solver with SciPy `linprog` (`ml/solver.py`)
- [x] Output 3 options: A = Air Freight, B = Secondary Supplier (+10%), C = Delay Launch
- [x] Return results in the agreed format (`docs/data_contract.md`)

### Mid-Project Review: Optimization Audit
- [x] Tests proving the solver never exceeds the budget (`ml/test_solver.py`)
- [x] 1000 random scenarios, assert cost <= budget

### Week 3: The Closed Loop
- [ ] Write `ml/evaluate.py`: compare predicted cost vs. actual cost from the database
- [ ] Compute the error per decision (example: predicted $15k, actual $18k)
- [ ] Write cost multipliers to `ml/solver_weights.json`

### Week 4: Continuous Learning
- [ ] Write `ml/retrain.py`: if error exceeds a threshold, retrain XGBoost
- [ ] Adjust solver cost weights using the discovered error
- [ ] Prepare the ML part of the final demo

---

## MEMBER 2 - Application and Data

### Week 1: App Scaffolding
- [x] Create tables: `shipments`, `prescriptions`, `decisions`, `outcomes` (`backend/schema.sql`)
- [x] Database connection code using environment variables (`backend/db.py`)
- [x] FastAPI skeleton with home and health endpoints (`backend/main.py`)
- [x] `.env.example` with sample database settings
- [ ] Install PostgreSQL, create database `supplyprescript`, run `schema.sql`
- [ ] Test the database connection and the API
- [ ] Load `shipments.csv` into the database (`backend/load_data.py`)

### Week 2: Prescriptive UI
- [ ] Endpoint `GET /prescriptions/{shipment_id}` (use the solver output format)
- [ ] Dashboard cards for options A, B, C showing Cost vs. Speed trade-offs

### Mid-Project Review: Write-Back Check
- [ ] "Execute Decision" button calls `POST /decisions`
- [ ] `POST /decisions` performs an INSERT into the `decisions` table
- [ ] Show the new row in the database live

### Week 3: Feedback UI
- [ ] Add `actual_cost` to completed decisions (`outcomes` table)
- [ ] Build the "Decision ROI" analytics page (how often recommendations worked)

### Week 4: Refine and Polish
- [ ] Error handling, loading states, clean layout
- [ ] Connect the retrain trigger to the app if time allows
- [ ] Final demo flow and presentation

---

## SHARED TASKS (do together)

- [x] Create the GitHub repo and invite each other
- [x] Create `docs/data_contract.md`
- [ ] Check that `schema.sql` column names match `data_contract.md`
- [ ] Review each other's Pull Requests
- [ ] Keep the README updated
- [ ] Rehearse the final demo together

## HANDOFFS (where your work connects)

| From | To | What | Status |
|---|---|---|---|
| Member 1 | Member 2 | `shipments.csv` (run `python ml/data_gen.py`) | ready |
| Member 1 | Member 2 | `prescribe()` in `ml/solver.py`, output format in data contract | ready |
| Member 2 | Member 1 | `decisions` and `outcomes` tables with `actual_cost` (Week 3) | pending |

## COMMIT RULES

- Commit at least once per working session, one logical change per commit
- Message format: `feat: ...`, `fix: ...`, `test: ...`, `docs: ...`
- Never push straight to `main`. Flow: branch -> commit -> push -> Pull Request -> review -> merge
- Never commit passwords, `.env`, model files, or large CSVs