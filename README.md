# IntelliSched

IntelliSched is an adaptive CPU scheduling simulator. It compares FCFS, idealized
SJF, ML-SJF, and adaptive ML-SJF using the same workload, while evaluating EWMA,
Random Forest, XGBoost, and an ensemble burst predictor against the supplied
`sjf_ml_training_dataset.csv`.

## Windows setup

Open PowerShell in this folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m pip install pytest httpx
```

Start the API in one PowerShell window:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the dashboard in a second PowerShell window:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open http://localhost:5173. The API documentation is available at
http://localhost:8000/docs.

## Tests and production build

```powershell
python -m pytest backend\tests -q
Set-Location frontend
npm run build
```

The backend is the source of truth for dataset summaries, model evaluation,
predictions, simulation results, and adaptive feedback. Process `actual_burst`
values are ground truth used only for execution and evaluation; ML-SJF makes
selection decisions from predicted values. Scheduling is non-preemptive and
the simulator accounts for arrival-time CPU idle periods.

If the CSV dataset is unavailable, the service fails explicitly rather than
fabricating model results. Place the expected file at the repository root or
provide a replacement with the documented feature columns and `next_burst_ms`
target.