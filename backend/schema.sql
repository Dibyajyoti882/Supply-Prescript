-- Supply Prescript: Database Schema


-- 1. Shipments: Input to the ML model
CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    supplier VARCHAR(100) NOT NULL,
    route VARCHAR(100) NOT NULL,
    order_qty INTEGER NOT NULL,
    planned_lead_days INTEGER NOT NULL,
    supplier_reliability NUMERIC(5, 2),
    port_congestion NUMERIC(5, 2),
    weather_risk NUMERIC(5, 2),
    delay_days INTEGER,
    is_delayed BOOLEAN
);

-- 2. Prescriptions: Solver recommendations
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id),
    option VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    est_cost NUMERIC(12, 2) NOT NULL,
    days_saved NUMERIC(10, 2) NOT NULL,
    risk NUMERIC(5, 2) NOT NULL,
    residual_delay_days NUMERIC(10, 2),
    fraction_used NUMERIC(5, 3),
    total_cost NUMERIC(12, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Decisions: User-selected prescription
CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id),
    option VARCHAR(20) NOT NULL,
    predicted_cost NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Outcomes: Actual results for evaluation
CREATE TABLE IF NOT EXISTS outcomes (
    id SERIAL PRIMARY KEY,
    decision_id INTEGER NOT NULL REFERENCES decisions(id),
    actual_cost NUMERIC(12, 2),
    actual_delay_days INTEGER,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
