"""Burst-time estimators used by IntelliSched.

The optional XGBoost dependency is deliberately imported lazily so the API
still works in minimal installations.
"""
from pathlib import Path
import pickle
import time
from typing import Dict, Iterable, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

DATASET = Path(__file__).resolve().parents[2] / "sjf_ml_training_dataset.csv"
MODEL_CACHE_PATH = Path(__file__).resolve().parent / "model_cache.pkl"

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
        result = alpha * value + (1.0 - alpha) * result
    return max(result, 1e-6)


class BurstModel:
    def __init__(self, dataset_path: Path = DATASET, cache_path: Path = MODEL_CACHE_PATH):
        self.dataset_path = Path(dataset_path)
        self.cache_path = Path(cache_path)
        self.models: Dict[str, object] = {}
        self.imputer = SimpleImputer(strategy="median")
        self.feature_columns = FEATURE_COLUMNS[:]
        self.trained = False
        self.metrics: List[Dict[str, float | str]] = []
        self.feedback_buffer: List[dict] = []
        self.dataset_frame: Optional[pd.DataFrame] = None
        self.evaluation: Dict[str, object] = {}

        # Load existing valid model cache; if not found or outdated, perform genuine offline training
        if not self.load_saved_model():
            self.train()

    @property
    def available_models(self) -> List[str]:
        return ["ewma"] + [name for name in ("random_forest", "xgboost") if name in self.models] + ["ensemble"]

    def load_saved_model(self) -> bool:
        if not self.cache_path.exists():
            return False
        try:
            if self.dataset_path.exists() and self.dataset_path.stat().st_mtime > self.cache_path.stat().st_mtime:
                return False
            with open(self.cache_path, "rb") as f:
                data = pickle.load(f)
            self.models = data.get("models", {})
            self.imputer = data.get("imputer", self.imputer)
            self.feature_columns = data.get("feature_columns", self.feature_columns)
            self.metrics = data.get("metrics", [])
            self.evaluation = data.get("evaluation", {})
            self.trained = bool(self.models and self.metrics)
            return self.trained and bool(self.evaluation)
        except Exception:
            return False

    def save_model_cache(self) -> None:
        if not self.trained or not self.models:
            return
        try:
            with open(self.cache_path, "wb") as f:
                pickle.dump({
                    "models": self.models,
                    "imputer": self.imputer,
                    "feature_columns": self.feature_columns,
                    "metrics": self.metrics,
                    "evaluation": self.evaluation,
                }, f, protocol=5)
        except Exception:
            pass

    def train(self, frame: pd.DataFrame | None = None) -> None:
        if frame is not None:
            self.dataset_frame = frame
        elif self.dataset_frame is None:
            if not self.dataset_path.exists():
                raise FileNotFoundError(f"Training dataset not found at {self.dataset_path}")
            self.dataset_frame = pd.read_csv(self.dataset_path)

        # Incorporate any buffered feedback if retraining from base
        if self.feedback_buffer and frame is None:
            buffer_df = pd.DataFrame(self.feedback_buffer)
            self.dataset_frame = pd.concat([self.dataset_frame, buffer_df], ignore_index=True)
            self.feedback_buffer = []

        df = self.dataset_frame
        columns = [c for c in self.feature_columns if c in df.columns]
        if not columns or "next_burst_ms" not in df:
            raise ValueError("Dataset must contain feature columns and next_burst_ms")
        self.feature_columns = columns

        x = self.imputer.fit_transform(df[columns])
        y = df["next_burst_ms"].astype(float)
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

        self.models = {}
        self.metrics = []
        self.evaluation = {}

        # 1. Random Forest Regressor
        rf_start = time.perf_counter()
        rf = RandomForestRegressor(
            n_estimators=80, random_state=42, n_jobs=-1, min_samples_leaf=2
        ).fit(x_train, y_train)
        rf_train_ms = (time.perf_counter() - rf_start) * 1000

        t0 = time.perf_counter()
        rf_pred = rf.predict(x_test)
        rf_infer_ms = ((time.perf_counter() - t0) / len(x_test)) * 1000
        self.models["random_forest"] = rf
        self.metrics.append(self._scores("random_forest", y_test, rf_pred, rf_train_ms, rf_infer_ms))

        # 2. XGBoost (Optional)
        xgb_pred = None
        try:
            from xgboost import XGBRegressor
            xgb_start = time.perf_counter()
            xgb = XGBRegressor(
                n_estimators=80, max_depth=5, learning_rate=0.08,
                objective="reg:squarederror", random_state=42, n_jobs=1,
            ).fit(x_train, y_train, verbose=False)
            xgb_train_ms = (time.perf_counter() - xgb_start) * 1000

            t0 = time.perf_counter()
            xgb_pred = xgb.predict(x_test)
            xgb_infer_ms = ((time.perf_counter() - t0) / len(x_test)) * 1000
            self.models["xgboost"] = xgb
            self.metrics.append(self._scores("xgboost", y_test, xgb_pred, xgb_train_ms, xgb_infer_ms))
        except (ImportError, ModuleNotFoundError, OSError, Exception):
            pass

        # 3. EWMA Baseline
        ewma_test = df.loc[y_test.index]["ewma_burst_estimate"].astype(float)
        self.metrics.insert(0, self._scores("ewma", y_test, ewma_test, 0.5, 0.01))

        # 4. Voting Ensemble (Average of ML models + EWMA)
        ensemble_preds = [self.models[name].predict(x_test) for name in self.models]
        ensemble_prediction = None
        if ensemble_preds:
            ensemble_preds.append(ewma_test.to_numpy())
            ensemble_prediction = np.mean(ensemble_preds, axis=0)
            avg_train_ms = sum(m["training_time_ms"] for m in self.metrics if m["model"] in self.models)
            self.metrics.append(self._scores("ensemble", y_test, ensemble_prediction, avg_train_ms, 0.05))

        evaluation_predictions = {
            "ewma": ewma_test.to_numpy(),
            **{name: model.predict(x_test) for name, model in self.models.items()}
        }
        if ensemble_prediction is not None:
            evaluation_predictions["ensemble"] = ensemble_prediction
        self.evaluation = {
            "dataset_rows": int(len(df)),
            "feature_count": len(columns),
            "feature_columns": columns,
            "train_rows": int(len(y_train)),
            "test_rows": int(len(y_test)),
            "target": "next_burst_ms",
            "points": [
                {
                    "actual": float(y_test.iloc[index]),
                    "predictions": {
                        name: float(predictions[index])
                        for name, predictions in evaluation_predictions.items()
                    }
                }
                for index in range(len(y_test))
            ],
            "feature_importance": {
                name: {
                    column: float(importance)
                    for column, importance in zip(columns, estimator.feature_importances_)
                }
                for name, estimator in self.models.items()
                if hasattr(estimator, "feature_importances_")
            }
        }
        self.trained = True
        self.save_model_cache()

    @staticmethod
    def _scores(name: str, actual, predicted, train_ms: float, infer_ms: float = 0.0) -> Dict[str, float | str]:
        actual_arr = np.asarray(actual, dtype=float)
        pred_arr = np.asarray(predicted, dtype=float)
        return {
            "model": name,
            "mae": float(mean_absolute_error(actual_arr, pred_arr)),
            "rmse": float(np.sqrt(mean_squared_error(actual_arr, pred_arr))),
            "r2": float(r2_score(actual_arr, pred_arr)),
            "training_time_ms": float(train_ms),
            "inference_time_ms": float(infer_ms),
        }

    def vectorize(self, features: Dict[str, float]) -> np.ndarray:
        row = [features.get(c, np.nan) for c in self.feature_columns]
        df_row = pd.DataFrame([row], columns=self.feature_columns)
        return self.imputer.transform(df_row)

    def predict(self, features: Dict[str, float], model: str = "ensemble") -> float:
        if model == "ewma":
            values = [features.get(c) for c in ("prev_burst_3", "prev_burst_2", "prev_burst_1")]
            available_vals = [v for v in values if v is not None]
            if not available_vals and "avg_burst" in features:
                available_vals = [features["avg_burst"]]
            return _ewma(available_vals)

        if model not in ("ensemble", *self.models):
            raise ValueError(f"Unknown or unavailable model: {model}")

        x = self.vectorize(features)
        if model == "ensemble":
            predictions = [float(m.predict(x)[0]) for m in self.models.values()]
            predictions.append(self.predict(features, "ewma"))
            return max(float(np.mean(predictions)), 1e-6)

        return max(float(self.models[model].predict(x)[0]), 1e-6)

    def feedback(self, features: Dict[str, float], actual: float, buffer_only: bool = False) -> None:
        row = {column: features.get(column, np.nan) for column in self.feature_columns}
        row["next_burst_ms"] = float(actual)
        self.feedback_buffer.append(row)
        if not buffer_only:
            # Append immediately and retrain
            if self.dataset_frame is None:
                self.dataset_frame = pd.read_csv(self.dataset_path)
            self.dataset_frame = pd.concat([self.dataset_frame, pd.DataFrame([row])], ignore_index=True)
            self.feedback_buffer = []
            self.train(self.dataset_frame)
