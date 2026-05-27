from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Dict

import joblib
import mlflow
import numpy as np
import optuna
import pandas as pd
import pandas_ta as ta
import xgboost as xgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler

MODEL_DIR = Path(__file__).resolve().parent
MODEL_PATH = MODEL_DIR / "model.joblib"
MLFLOW_TRACKING_URI = str(MODEL_DIR / "mlruns")

mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
mlflow.set_experiment("banknifty-xgboost")


def load_data(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    return df


def create_features(df: pd.DataFrame) -> pd.DataFrame:
    df["ema_20"] = ta.ema(df["close"], length=20)
    df["rsi_14"] = ta.rsi(df["close"], length=14)
    bb = ta.bbands(df["close"], length=20, std=2)
    df["bb_upper"] = bb["BBU_20_2.0"]
    df["bb_lower"] = bb["BBL_20_2.0"]
    df["atr_14"] = ta.atr(df["high"], df["low"], df["close"], length=14)
    df["pct_b"] = ((df["close"] - df["bb_lower"]) / (df["bb_upper"] - df["bb_lower"])).fillna(0.5)
    df["close_minus_ema"] = df["close"] - df["ema_20"]
    df["future_return"] = df["close"].pct_change().shift(-1)
    df["signal"] = (df["future_return"] > 0).astype(int)
    return df.dropna()


def objective(trial: optuna.Trial, X: np.ndarray, y: np.ndarray, splits: TimeSeriesSplit) -> float:
    params: Dict[str, Any] = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 300),
        "max_depth": trial.suggest_int("max_depth", 3, 8),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "subsample": trial.suggest_float("subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
        "gamma": trial.suggest_float("gamma", 0.0, 5.0),
        "use_label_encoder": False,
        "eval_metric": "logloss",
        "random_state": 42,
    }

    scores = []
    for train_index, test_index in splits.split(X):
        model = xgb.XGBClassifier(**params)
        model.fit(X[train_index], y[train_index])
        scores.append(model.score(X[test_index], y[test_index]))

    return float(np.mean(scores))


def train(path: Path) -> None:
    df = load_data(path)
    df = create_features(df)
    feature_columns = ["close_minus_ema", "pct_b", "rsi_14", "atr_14"]
    X = df[feature_columns].to_numpy()
    y = df["signal"].to_numpy().astype(int)

    splits = TimeSeriesSplit(n_splits=5)
    study = optuna.create_study(direction="maximize")
    study.optimize(lambda trial: objective(trial, X, y, splits), n_trials=25)

    best_params = dict(study.best_params)
    best_params.update({"use_label_encoder": False, "eval_metric": "logloss", "random_state": 42})

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    model = xgb.XGBClassifier(**best_params)
    model.fit(X_scaled, y)

    joblib.dump({"model": model, "scaler": scaler}, MODEL_PATH)

    with mlflow.start_run(run_name="model_training"):
        mlflow.log_params(best_params)
        mlflow.log_metric("best_score", study.best_value)
        mlflow.log_artifact(str(MODEL_PATH))

    print(f"Saved optimized model to {MODEL_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train XGBoost model for BankNifty signal prediction")
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "historical.csv")
    args = parser.parse_args()
    train(args.data)
