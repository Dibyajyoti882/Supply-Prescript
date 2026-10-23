"""Train XGBoost models to predict shipment delays (Member1)."""
import os
import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, roc_auc_score, mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier, XGBRegressor

DATA_PATH = "ml/shipments.csv"
MODEL_DIR = "ml/models"

CATEGORICAL = ["supplier", "route"]
NUMERIC = [
    "order_qty", "planned_lead_days", "supplier_reliability",
    "port_congestion", "weather_risk",
]


def load_data(path=DATA_PATH):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} not found. Run: python ml/data_gen.py")
    return pd.read_csv(path)


def build_features(df, columns=None):
    X = pd.get_dummies(df[CATEGORICAL + NUMERIC], columns=CATEGORICAL)
    if columns is not None:
        X = X.reindex(columns=columns, fill_value=0)
    return X.astype(float)


def train():
    df = load_data()
    X = build_features(df)
    y_cls = df["is_delayed"]
    y_reg = df["delay_days"]

    X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te = train_test_split(
        X, y_cls, y_reg, test_size=0.2, random_state=42, stratify=y_cls
    )

    # 1) Will the shipment be delayed?
    clf = XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.1,
        subsample=0.9, colsample_bytree=0.9, eval_metric="logloss",
    )
    clf.fit(X_tr, yc_tr)
    proba = clf.predict_proba(X_te)[:, 1]
    print("=== Classifier: is_delayed ===")
    print("Accuracy:", round(accuracy_score(yc_te, clf.predict(X_te)), 3))
    print("ROC-AUC :", round(roc_auc_score(yc_te, proba), 3))

    # 2) How many days late?
    reg = XGBRegressor(
        n_estimators=200, max_depth=4, learning_rate=0.1,
        subsample=0.9, colsample_bytree=0.9,
    )
    reg.fit(X_tr, yr_tr)
    pred_days = reg.predict(X_te)
    print("\n=== Regressor: delay_days ===")
    print("MAE (days):", round(mean_absolute_error(yr_te, pred_days), 3))
    print("R2         :", round(r2_score(yr_te, pred_days), 3))

    imp = pd.Series(clf.feature_importances_, index=X.columns).sort_values(ascending=False)
    print("\nTop features:\n", imp.head(5).round(3))

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(clf, f"{MODEL_DIR}/delay_classifier.joblib")
    joblib.dump(reg, f"{MODEL_DIR}/delay_regressor.joblib")
    joblib.dump(list(X.columns), f"{MODEL_DIR}/feature_columns.joblib")
    print(f"\nModels saved to {MODEL_DIR}/")


def predict_delay(shipment: dict):
    """Predict for one shipment. The solver and API will use this later."""
    clf = joblib.load(f"{MODEL_DIR}/delay_classifier.joblib")
    reg = joblib.load(f"{MODEL_DIR}/delay_regressor.joblib")
    cols = joblib.load(f"{MODEL_DIR}/feature_columns.joblib")
    X = build_features(pd.DataFrame([shipment]), columns=cols)
    return {
        "delay_probability": round(float(clf.predict_proba(X)[0, 1]), 3),
        "predicted_delay_days": max(0, int(round(float(reg.predict(X)[0])))),
    }


if __name__ == "__main__":
    train()
    example = {
        "supplier": "SUP_B", "route": "SEA", "order_qty": 2000,
        "planned_lead_days": 30, "supplier_reliability": 0.7,
        "port_congestion": 0.9, "weather_risk": 0.8,
    }
    print("\nExample prediction:", predict_delay(example))