
-- Supply Prescript: Database Schema

CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    supplier VARCHAR(100) NOT NULL,
    part VARCHAR(100) NOT NULL,
    order_date DATE NOT NULL,
    expected_lead_days INTEGER NOT NULL,
    actual_lead_days INTEGER,
    delayed BOOLEAN
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id),
    option VARCHAR(20) NOT NULL,
    predicted_cost NUMERIC(12, 2) NOT NULL,
    predicted_days_saved INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY,
    shipment_id INTEGER NOT NULL REFERENCES shipments(id),
    option_chosen VARCHAR(20) NOT NULL,
    chosen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decision_user VARCHAR(100),
    predicted_cost NUMERIC(12, 2),
    actual_cost NUMERIC(12, 2)
);

CREATE TABLE IF NOT EXISTS outcomes (
    id SERIAL PRIMARY KEY,
    decision_id INTEGER NOT NULL REFERENCES decisions(id),
    actual_cost NUMERIC(12, 2),
    actual_days INTEGER,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);