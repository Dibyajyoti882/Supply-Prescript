"""Generate mock shipment data for SupplyPrescript (Member1)."""
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
N = 5000

df = pd.DataFrame({
    "shipment_id": range(1, N + 1),
    "supplier": rng.choice(["SUP_A", "SUP_B", "SUP_C", "SUP_D"], N),
    "route": rng.choice(["SEA", "AIR", "ROAD"], N, p=[0.5, 0.2, 0.3]),
    "order_qty": rng.integers(100, 5000, N),
    "planned_lead_days": rng.integers(5, 45, N),
    "supplier_reliability": rng.uniform(0.6, 1.0, N).round(2),
    "port_congestion": rng.uniform(0, 1, N).round(2),
    "weather_risk": rng.uniform(0, 1, N).round(2),
})

delay = (
    15 * (1 - df["supplier_reliability"])
    + 8 * df["port_congestion"]
    + 6 * df["weather_risk"]
    - 9
    + rng.normal(0, 1.5, N)
)
df["delay_days"] = delay.clip(lower=0).round().astype(int)
df["is_delayed"] = (df["delay_days"] > 3).astype(int)

df.to_csv("ml/shipments.csv", index=False)
print(df.head())
print("Rows:", len(df))
print("Delay rate:", round(df["is_delayed"].mean(), 3))