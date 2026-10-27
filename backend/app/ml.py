"""Burst-time estimators used by IntelliSched.

The optional XGBoost dependency is deliberately imported lazily so the API
still works in minimal installations.
"""
from pathlib import Path
from typing import Dict, Iterable, List
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import time

DATASET = Path(__file__).resolve().parents[2] / "sjf_ml_training_dataset.csv"
FEATURE_COLUMNS = [
    "prev_burst_1", "prev_burst_2", "prev_burst_3", "avg_burst",
    "std_burst", "ewma_burst_estimate", "cpu_utilization", "memory_usage_mb",
    "thread_count", "avg_io_wait_ms", "avg_io_count",
]


def _ewma(values: Iterable[float], alpha: float = 0.3) -> float:
    vals = [float(v) for v in values]
    if not vals:
        return 1.0
    result = vals[0]
    for value in vals[1:]:
        result = alpha * value + (1 - alpha) * result
    return max(result, 1e-6)


class BurstModel:
    def __init__(self, dataset_path: Path = DATASET):
        self.dataset_path = Path(dataset_path)
        self.models: Dict[str, object] = {}
        self.imputer = SimpleImputer(strategy="median")
        self.feature_columns = FEATURE_COLUMNS[:]
        self.trained = False
        self.metrics: List[Dict[str, float | str]] = []
        self.train()

    @property
    def available_models(self) -> List[str]:
        return ["ewma"] + [name for name in ("random_forest", "xgboost") if name in self.models] + ["ensemble"]

    def train(self, frame: pd.DataFrame | None = None) -> None:
        frame = frame if frame is not None else pd.read_csv(self.dataset_path)
        columns = [c for c in self.feature_columns if c in frame.columns]
        if not columns or "next_burst_ms" not in frame:
            raise ValueError("Dataset must contain feature columns and next_burst_ms")
        self.feature_columns = columns
        x = self.imputer.fit_transform(frame[columns])
        y = frame["next_burst_ms"].astype(float)
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)
        self.models = {}
        self.metrics = []
        started = time.perf_counter()
        self.models["random_forest"] = RandomForestRegressor(
            n_estimators=80, random_state=42, n_jobs=-1, min_samples_leaf=2
        ).fit(x_train, y_train)
        rf_pred = self.models["random_forest"].predict(x_test)
        self.metrics.append(self._scores("random_forest", y_test, rf_pred, started))
        try:
            from xgboost import XGBRegressor
            self.models["xgboost"] = XGBRegressor(
                n_estimators=80, max_depth=5, learning_rate=0.08,
                objective="reg:squarederror", random_state=42, n_jobs=1,
            ).fit(x_train, y_train, verbose=False)
            xgb_pred = self.models["xgboost"].predict(x_test)
            self.metrics.append(self._scores("xgboost", y_test, xgb_pred, started))
        except (ImportError, ModuleNotFoundError, OSError, Exception):
            # XGBoost is optional and can fail to load due to native libraries.
            pass
        predictions = [self.models[name].predict(x_test) for name in self.models]
        if predictions:
            ensemble = np.mean(predictions, axis=0)
            self.metrics.append(self._scores("ensemble", y_test, ensemble, started))
        ewma = frame.loc[y_test.index]["ewma_burst_estimate"].astype(float)
        self.metrics.insert(0, self._scores("ewma", y_test, ewma, started))
        self.trained = True

    @staticmethod
    def _scores(name: str, actual, predicted, started: float) -> Dict[str, float | str]:
        return {"model": name, "mae": float(mean_absolute_error(actual, predicted)),
                "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
                "r2": float(r2_score(actual, predicted)),
                "training_time_ms": float((time.perf_counter() - started) * 1000),
                "inference_time_ms": 0.0}

    def vectorize(self, features: Dict[str, float]) -> np.ndarray:
        return self.imputer.transform([[features.get(c, np.nan) for c in self.feature_columns]])

    def predict(self, features: Dict[str, float], model: str = "ensemble") -> float:
        if model == "ewma":
            values = [features.get(c) for c in ("prev_burst_3", "prev_burst_2", "prev_burst_1")]
            return _ewma([v for v in values if v is not None])
        if model not in ("ensemble", *self.models):
            raise ValueError(f"Unknown or unavailable model: {model}")
        x = self.vectorize(features)
        if model == "ensemble":
            predictions = [float(m.predict(x)[0]) for m in self.models.values()]
            predictions.append(self.predict(features, "ewma"))
            return max(float(np.mean(predictions)), 1e-6)
        return max(float(self.models[model].predict(x)[0]), 1e-6)

    def feedback(self, features: Dict[str, float], actual: float) -> None:
        row = {column: features.get(column, np.nan) for column in self.feature_columns}
        row["next_burst_ms"] = actual
        frame = pd.concat([pd.read_csv(self.dataset_path), pd.DataFrame([row])], ignore_index=True)
        self.train(frame)
