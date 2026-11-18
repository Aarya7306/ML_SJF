# IntelliSched

IntelliSched is a full-stack adaptive ML-based CPU scheduling project. The React
dashboard sends one process workload to four non-preemptive scheduling policies
and displays genuine backend metrics, schedules and held-out ML evaluation.

## Requirements

- Windows 10/11
- Python 3.11
- Node.js and npm
- `sjf_ml_training_dataset.csv` in the project root

The runtime also expects the serialized model cache at
`backend/app/model_cache.pkl`. The cache is optional: if it is missing or
outdated, the API trains the offline models and recreates it.

## Start the application

Install Python dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m pip install pytest httpx
```

Start the FastAPI backend:

```powershell
py -3.11 -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the React dashboard in another terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. API documentation is available at
`http://127.0.0.1:8000/docs`.

## Dashboard sections

1. **Overview** - dataset summary, ML feature count, latest simulation status,
   four-policy summary and quick navigation.
2. **Processes** - add, edit, delete and reset the workload.
3. **Scheduling Comparison** - compare FCFS, ideal SJF, ML-SJF and
   Adaptive-ML-SJF with metrics, Gantt charts and execution order.
4. **ML Model Analysis** - EWMA, Random Forest, XGBoost and Ensemble metrics,
   held-out scatter plots, residual plot and feature importance.
5. **Adaptive Scheduler Analysis** - predicted and adjusted bursts, waiting
   adjustments, process decisions and ML-SJF comparison.

## Core datasets and files

The only runtime training dataset is `sjf_ml_training_dataset.csv`. It contains
12,000 rows, 11 model input features and the `next_burst_ms` target.

The following source files are no longer part of the project:

- `sjf_ml_dataset_full.csv`
- `sjf_cpu_burst_dataset.xlsx`
- `Task_2_EDA_EWMA_Baseline.ipynb`

They were not referenced by the backend, frontend or tests and are not required
for training or live scheduling.

## Validation

Run backend tests:

```powershell
py -3.11 -m pytest backend\tests -q
```

Run the frontend production build:

```powershell
cd frontend
npm run build
```
