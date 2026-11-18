# IntelliSched Technical Documentation

## 1. Project overview

IntelliSched is a full-stack CPU scheduling simulator.

It compares four non-preemptive policies using the same process workload:

1. **FCFS** - execution in arrival order.
2. **SJF** - execution by actual CPU burst time.
3. **ML-SJF** - execution by ensemble-predicted burst time.
4. **Adaptive-ML-SJF** - execution by predicted burst with waiting-time aging:

```text
Adjusted Burst = Predicted Burst - (Waiting Time × 0.10)
```

The FastAPI backend is the source of truth for dataset information, offline ML
evaluation, process scheduling and simulation metrics. The React frontend is
only a presentation and request client.

## 2. Runtime architecture

```text
React/Vite frontend
        |
        | HTTP JSON
        v
FastAPI backend
        |
        +-- Dataset and offline model cache
        +-- EWMA, Random Forest, XGBoost and Ensemble
        +-- Independent scheduling implementation
        +-- Pydantic process and response models
```

Runtime ports:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- OpenAPI: `http://127.0.0.1:8000/docs`

## 3. Project structure

| Path | Responsibility |
|---|---|
| `backend/app/main.py` | FastAPI routes, CORS, model singleton and latest simulation state |
| `backend/app/ml.py` | Dataset loading, cache management, split-based training and predictions |
| `backend/app/scheduler.py` | Feature extraction, policy dispatching and schedule metrics |
| `backend/app/schemas.py` | Pydantic request and response schemas |
| `backend/app/model_cache.pkl` | Serialized model objects and held-out evaluation data |
| `backend/tests/test_backend.py` | API, scheduling, data-leakage and evaluation tests |
| `backend/requirements.txt` | Python runtime dependencies |
| `frontend/src/App.jsx` | Five-section dashboard |
| `frontend/src/services/api.js` | API base URL and HTTP wrappers |
| `frontend/src/styles.css` | IntelliSched theme, charts and responsive layout |
| `frontend/src/main.jsx` | React entry point |
| `frontend/vite.config.js` | Vite development configuration |
| `frontend/package.json` | Frontend dependencies and scripts |
| `sjf_ml_training_dataset.csv` | Runtime training and held-out evaluation source |
| `README.md` | Setup and validation instructions |
| `TECHNICAL_DOCUMENTATION.md` | Architecture and implementation reference |

## 4. Dataset

The runtime source is `sjf_ml_training_dataset.csv`.

- Rows: 12,000
- Train split: 9,600 rows
- Held-out test split: 2,400 rows
- Target: `next_burst_ms`
- Model inputs: 11 feature columns

Feature columns:

| Feature | Meaning |
|---|---|
| `prev_burst_1` | Most recent previous CPU burst |
| `prev_burst_2` | Second previous CPU burst |
| `prev_burst_3` | Third previous CPU burst |
| `avg_burst` | Historical average burst |
| `std_burst` | Historical burst standard deviation |
| `ewma_burst_estimate` | Existing EWMA estimate |
| `cpu_utilization` | CPU utilization |
| `memory_usage_mb` | Memory usage |
| `thread_count` | Thread count |
| `avg_io_wait_ms` | Average I/O wait |
| `avg_io_count` | Average I/O operations |

Removed unused source artifacts:

- `sjf_ml_dataset_full.csv`
- `sjf_cpu_burst_dataset.xlsx`
- `Task_2_EDA_EWMA_Baseline.ipynb`

They are not imported or referenced by runtime code or tests.

## 5. ML evaluation

The API does not retrain on every frontend page load.

The offline training process:

1. Load `sjf_ml_training_dataset.csv`.
2. Select columns that exist in the dataset.
3. Median-impute missing values.
4. Split 80/20 with `random_state=42`.
5. Train EWMA, Random Forest and XGBoost when available.
6. Calculate MAE, RMSE and R² on held-out test rows.
7. Cache model objects and held-out predictions.

Cache invalidation occurs when the dataset is newer than the cache or cached
evaluation data is missing.

### Model metrics

Each model row contains:

- MAE
- RMSE
- R²
- Training time
- Inference time

### ML charts

The ML page uses genuine held-out predictions:

- **Actual vs Predicted**:
  actual burst on X, predicted burst on Y
- **Residual vs Predicted**:
  predicted burst on X, `actual - predicted` on Y
- **Feature Importance**:
  Random Forest feature importances

The residual chart uses 2,400 test observations. It is not a sampled or
fabricated series. Predictions are rendered as small, partly transparent points
with a visible zero-residual reference line.

## 6. Scheduling logic

The simulator is non-preemptive.

For each ready process:

1. Advance the CPU clock to the next arrival if the ready queue is empty.
2. Consider processes whose arrival time is at or before the current clock.
3. Select according to the active policy.
4. Execute the process until its actual burst finishes.
5. Repeat until every process is completed.

Selection keys:

| Policy | Selection key |
|---|---|
| FCFS | `(arrival_time, process_id)` |
| SJF | `(actual_burst, arrival_time, process_id)` |
| ML-SJF | `(predicted_burst, arrival_time, process_id)` |
| Adaptive-ML-SJF | `(adjusted_burst, priority, process_id)` |

The adaptive adjusted burst is calculated with the configured `0.10` factor:

```text
Adjusted Burst =
Predicted Burst - (Waiting Time × 0.10)
```

Missing live ML features use neutral defaults. Actual burst is never used to
derive missing predictor inputs, preventing data leakage between process
execution ground truth and ML-SJF ranking.

## 7. Scheduling metrics

For a completed schedule:

- **Waiting time**: `start_time - arrival_time`
- **Response time**: `start_time - arrival_time` for non-preemptive execution
- **Turnaround time**: `completion_time - arrival_time`
- **Throughput**: completed process count divided by final clock time
- **CPU utilization**: executed burst time divided by final clock time
- **Maximum waiting time**: largest process waiting time

Waiting and response time are equal in this non-preemptive implementation
because the first CPU start is the only response event.

## 8. API endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dataset/summary` | Dataset row count and columns |
| `GET` | `/api/ml/metrics` | Current model metrics |
| `GET` | `/api/ml/analysis` | Held-out predictions, residual inputs and feature importance |
| `POST` | `/api/ml/train` | Explicit offline model retraining |
| `POST` | `/api/ml/predict` | Predict a burst with a selected model |
| `POST` | `/api/simulation/compare` | Run all four policies independently |
| `POST` | `/api/simulation/run` | Run one selected policy |
| `GET` | `/api/simulation/{simulation_id}` | Retrieve a stored simulation |

The frontend does not fabricate chart values. Missing or failed API data is
shown through empty or error states.

## 9. Frontend design

The dashboard uses the existing IntelliSched sidebar, cards, metrics, tabs,
buttons, chart colors and responsive breakpoints.

Exactly five navigation sections are implemented:

1. Overview
2. Processes
3. Scheduling Comparison
4. ML Model Analysis
5. Adaptive Scheduler Analysis

The build output is written to `frontend/dist`. Node dependencies and build
output are excluded with `.gitignore`.

## 10. Validation

Backend tests cover health, prediction, scheduling, idle time, dataset summary,
held-out analysis, adaptive decisions and feedback.

```powershell
py -3.11 -m pytest backend\tests -q
cd frontend
npm run build
```
