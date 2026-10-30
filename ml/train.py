"""Train XGBoost models to predict shipment delays (Member1).

Run from the project root:
    python ml/data_gen.py     # creates ml/shipments.csv
    python ml/train.py        # trains and saves models to ml/models/

retrain.py reuses the helper functions below.
"""
import os

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, mean_absolute_error, r2_score, roc_auc_score
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
    """One-hot encode supplier/route. Pass `columns` at predict time to match training."""
    X = pd.get_dummies(df[CATEGORICAL + NUMERIC], columns=CATEGORICAL)
    if columns is not None:
        X = X.reindex(columns=columns, fill_value=0)
    return X.astype(float)


def split_data(df, test_size=0.2, seed=42):
    X = build_features(df)
    y_cls, y_reg = df["is_delayed"], df["delay_days"]
    return train_test_split(X, y_cls, y_reg, test_size=test_size,
                            random_state=seed, stratify=y_cls)


def fit_models(X_tr, yc_tr, yr_tr):
    clf = XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.1,
                        subsample=0.9, colsample_bytree=0.9, eval_metric="logloss")
    clf.fit(X_tr, yc_tr)
    reg = XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.1,
                       subsample=0.9, colsample_bytree=0.9)
    reg.fit(X_tr, yr_tr)
    return clf, reg


def score_models(clf, reg, X_te, yc_te, yr_te):
    proba = clf.predict_proba(X_te)[:, 1]
    pred_days = reg.predict(X_te)
    return {
        "accuracy": round(float(accuracy_score(yc_te, clf.predict(X_te))), 4),
        "roc_auc": round(float(roc_auc_score(yc_te, proba)), 4),
        "mae_days": round(float(mean_absolute_error(yr_te, pred_days)), 4),
        "r2": round(float(r2_score(yr_te, pred_days)), 4),
    }


def save_models(clf, reg, columns, model_dir=MODEL_DIR):
    os.makedirs(model_dir, exist_ok=True)
    joblib.dump(clf, f"{model_dir}/delay_classifier.joblib")
    joblib.dump(reg, f"{model_dir}/delay_regressor.joblib")
    joblib.dump(list(columns), f"{model_dir}/feature_columns.joblib")


def load_models(model_dir=MODEL_DIR):
    """Return (clf, reg, columns) or None if no models are saved yet."""
    paths = [f"{model_dir}/{n}.joblib" for n in ("delay_classifier", "delay_regressor", "feature_columns")]
    if not all(os.path.exists(p) for p in paths):
        return None
    return tuple(joblib.load(p) for p in paths)


def train(df=None, model_dir=MODEL_DIR):
    df = load_data() if df is None else df
    X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te = split_data(df)
    clf, reg = fit_models(X_tr, yc_tr, yr_tr)
    m = score_models(clf, reg, X_te, yc_te, yr_te)

    print("=== Classifier: is_delayed ===")
    print("Accuracy:", m["accuracy"])
    print("ROC-AUC :", m["roc_auc"])
    print("\n=== Regressor: delay_days ===")
    print("MAE (days):", m["mae_days"])
    print("R2         :", m["r2"])

    imp = pd.Series(clf.feature_importances_, index=X_tr.columns).sort_values(ascending=False)
    print("\nTop features:\n", imp.head(5).round(3))

    save_models(clf, reg, X_tr.columns, model_dir)
    print(f"\nModels saved to {model_dir}/")
    return m


def predict_delay(shipment: dict, model_dir=MODEL_DIR):
    """Predict for one shipment. The solver and API use this."""
    loaded = load_models(model_dir)
    if loaded is None:
        raise FileNotFoundError(f"No models in {model_dir}. Run: python ml/train.py")
    clf, reg, cols = loaded
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