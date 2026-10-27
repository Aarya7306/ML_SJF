from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from .ml import DATASET, FEATURE_COLUMNS
from .ml import BurstModel
from .schemas import (FeedbackRequest, PredictionRequest, PredictionResponse,
                      ScheduleRequest, ScheduleResponse, SimulationRequest, SimulationResponse)
from .scheduler import schedule

app = FastAPI(title="IntelliSched API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
model = BurstModel()
feedback_count = 0
last_simulation = {}


@app.get("/health")
def health():
    return {"status": "ok", "models": model.available_models}


@app.get("/api/health")
def api_health():
    return health()


@app.get("/api/dataset/summary")
def dataset_summary():
    frame = pd.read_csv(DATASET)
    return {"rows": len(frame), "columns": list(frame.columns),
            "target": "next_burst_ms", "cpu_utilization": float(frame["cpu_utilization"].mean())}


@app.get("/api/ml/metrics")
def ml_metrics():
    return {"models": model.metrics}


@app.post("/api/ml/train")
def api_train():
    model.train()
    return {"status": "trained", "models": model.available_models}


@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    try:
        value = model.predict(request.features, request.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return PredictionResponse(prediction=value, model=request.model, available_models=model.available_models)


@app.post("/api/ml/predict", response_model=PredictionResponse)
def api_predict(request: PredictionRequest):
    return predict(request)


@app.post("/schedule", response_model=ScheduleResponse)
def make_schedule(request: ScheduleRequest):
    if not request.processes:
        return ScheduleResponse(algorithm=request.algorithm, schedule=[], metrics={
            "average_waiting_time": 0.0, "average_turnaround_time": 0.0, "throughput": 0.0, "fairness": 1.0})
    algorithm = request.algorithm.replace("_", "-")
    result, metrics = schedule(request.processes, algorithm, lambda f: model.predict(f, "ensemble"))
    return ScheduleResponse(algorithm=request.algorithm, schedule=result, metrics=metrics)


@app.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    return SimulationResponse(results={
        algorithm: schedule(request.processes, algorithm.replace("_", "-"), lambda f: model.predict(f, "ensemble"))[1]
        for algorithm in request.algorithms
    })


@app.post("/api/simulation/compare")
def api_compare(request: SimulationRequest):
    global last_simulation
    results = {}
    schedules = {}
    for algorithm in request.algorithms:
        normalized = algorithm.replace("_", "-")
        scheduled, metrics = schedule(request.processes, normalized, lambda f: model.predict(f, "ensemble"))
        results[algorithm] = metrics
        schedules[algorithm] = [item.model_dump() for item in scheduled]
    last_simulation = {"results": results, "schedules": schedules}
    return {"results": [{"algorithm": name, **values} for name, values in results.items()],
            "schedules": schedules}


@app.post("/api/simulation/run")
def api_run(request: ScheduleRequest):
    return make_schedule(request)


@app.get("/api/simulation/{simulation_id}")
def get_simulation(simulation_id: str):
    if simulation_id != "latest" or not last_simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return {"simulation_id": "latest", "results": last_simulation}


@app.get("/api/adaptive/status")
def adaptive_status():
    return {"status": "Ready", "observations": feedback_count,
            "samples_until_retrain": max(0, 25 - feedback_count), "model_version": "v1.0"}


@app.post("/feedback")
def feedback(request: FeedbackRequest):
    global feedback_count
    feedback_count += 1
    model.feedback(request.features, request.actual_burst)
    return {"status": "retrained", "models": model.available_models, "observations": feedback_count}


@app.post("/models/retrain")
def retrain():
    model.train()
    return {"status": "retrained", "models": model.available_models}


@app.post("/api/adaptive/feedback")
def api_feedback(request: FeedbackRequest):
    return feedback(request)


@app.post("/api/adaptive/retrain")
def api_retrain():
    return retrain()
