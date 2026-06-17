from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import pandas_ta as ta
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import mlflow
except Exception:  # pragma: no cover - optional dependency fallback
    mlflow = None

try:
    import quantstats as qs
except Exception:  # pragma: no cover - optional dependency fallback
    qs = None

try:
    import xgboost as xgb
except Exception:  # pragma: no cover - optional dependency fallback
    xgb = None

from sklearn.linear_model import LogisticRegression

MODEL_DIR = Path(__file__).resolve().parent
MODEL_PATH = MODEL_DIR / "model.joblib"
MLFLOW_TRACKING_URI = str(MODEL_DIR / "mlruns")

if mlflow is not None:
    mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
    mlflow.set_experiment("banknifty-xgboost")

app = FastAPI(title="BankNifty Python Model Service")
model_cache: Optional[Any] = None
scheduler = BackgroundScheduler()


class MarketPredictionRequest(BaseModel):
    symbol: str = Field(default="BANKNIFTY")
    opens: List[float]
    highs: List[float]
    lows: List[float]
    closes: List[float]
    volumes: Optional[List[float]] = None
    pcr: Optional[float] = None
    timestamp: Optional[int] = None


class MarketPredictionResponse(BaseModel):
    model_score: float
    model_prediction: str
    confidence: float
    details: Dict[str, float]
    model_version: str


def build_feature_dataframe(payload: MarketPredictionRequest) -> pd.DataFrame:
    df = pd.DataFrame(
        {
            "open": payload.opens,
            "high": payload.highs,
            "low": payload.lows,
            "close": payload.closes,
            "volume": payload.volumes or [0.0] * len(payload.closes),
        }
    )
    df["ema_20"] = ta.ema(df["close"], length=20)
    df["rsi_14"] = ta.rsi(df["close"], length=14)
    bb = ta.bbands(df["close"], length=20, std=2)
    df["bb_upper"] = bb["BBU_20_2.0"]
    df["bb_middle"] = bb["BBM_20_2.0"]
    df["bb_lower"] = bb["BBL_20_2.0"]
    df["atr_14"] = ta.atr(df["high"], df["low"], df["close"], length=14)
    df["pcr"] = payload.pcr if payload.pcr is not None else 1.0
    df["pct_b"] = ((df["close"] - df["bb_lower"]) / (df["bb_upper"] - df["bb_lower"])).fillna(0.5)
    df["close_minus_ema"] = df["close"] - df["ema_20"]
    df["return_1"] = df["close"].pct_change().fillna(0.0)
    return df.fillna(method="ffill").fillna(0.0)


def create_dummy_model() -> Any:
    X = np.random.normal(size=(256, 5))
    y = (np.random.rand(256) > 0.5).astype(int)
    if xgb is not None:
            model = xgb.XGBClassifier(
                    use_label_encoder=False,
                    eval_metric="logloss",
                    n_estimators=25,
                    max_depth=4,
                    learning_rate=0.1,
                    random_state=42,
            )
    else:
            model = LogisticRegression(max_iter=200)
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model


def load_model() -> Any:
    global model_cache
    if model_cache is not None:
        return model_cache

    if MODEL_PATH.exists():
        model_cache = joblib.load(MODEL_PATH)
        return model_cache

    model_cache = create_dummy_model()
    return model_cache


def compute_quantstats_metrics(returns: pd.Series) -> Dict[str, float]:
    results: Dict[str, float] = {}
    if len(returns) < 10:
        return {"sharpe": 0.0, "annual_return": 0.0}

    if qs is None:
        return {"sharpe": 0.0, "annual_return": 0.0}

    try:
        results["sharpe"] = float(qs.stats.sharpe(returns))
        results["annual_return"] = float(qs.stats.cagr(returns + 1))
    except Exception:
        results["sharpe"] = 0.0
        results["annual_return"] = 0.0
    return results


def predict_model(payload: MarketPredictionRequest) -> MarketPredictionResponse:
    df = build_feature_dataframe(payload)
    if len(df) < 20:
        raise HTTPException(status_code=400, detail="Insufficient candle history for model prediction")

    model = load_model()
    feature_columns = ["close_minus_ema", "pct_b", "rsi_14", "atr_14", "pcr"]
    x = df[feature_columns].iloc[-1:].to_numpy()

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(x)[0]
        score = float(np.round(probabilities[1] * 100, 2))
        prediction = "BUY" if probabilities[1] >= probabilities[0] else "SELL"
        confidence = float(np.round(abs(probabilities[1] - probabilities[0]) * 100, 2))
    else:
        predicted = int(model.predict(x)[0])
        score = 100.0 if predicted == 1 else 0.0
        prediction = "BUY" if predicted == 1 else "SELL"
        confidence = 100.0

    tracking_details = {
        "ema_20": float(df["ema_20"].iloc[-1]),
        "rsi_14": float(df["rsi_14"].iloc[-1]),
        "atr_14": float(df["atr_14"].iloc[-1]),
        "pct_b": float(df["pct_b"].iloc[-1]),
        "pcr": float(df["pcr"].iloc[-1]),
        "close_minus_ema": float(df["close_minus_ema"].iloc[-1]),
    }
    tracking_details.update(compute_quantstats_metrics(df["return_1"]))

    if mlflow is not None:
        with mlflow.start_run(run_name="online_prediction", nested=True):
            mlflow.log_param("symbol", payload.symbol)
            mlflow.log_param("observations", len(df))
            mlflow.log_params({"model_version": MODEL_PATH.name})
            mlflow.log_metric("model_score", score)
            mlflow.log_metric("confidence", confidence)
            mlflow.log_metric("pcr", payload.pcr if payload.pcr is not None else 1.0)
            for key, value in tracking_details.items():
                mlflow.log_metric(key, value)

    return MarketPredictionResponse(
        model_score=score,
        model_prediction=prediction,
        confidence=confidence,
        details=tracking_details,
        model_version=str(MODEL_PATH.name),
    )


@app.post("/model/predict", response_model=MarketPredictionResponse)
def model_predict(payload: MarketPredictionRequest) -> MarketPredictionResponse:
    return predict_model(payload)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "model_path": str(MODEL_PATH)}


def refresh_model_cache() -> None:
    load_model()


scheduler.add_job(refresh_model_cache, trigger="cron", hour="6", minute="0")
scheduler.start()


@app.on_event("shutdown")
def shutdown_event() -> None:
    scheduler.shutdown(wait=False)
