from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from .ml import DATASET, BurstModel
from .schemas import (
    BatchFeedbackRequest, FeedbackRequest, PredictionRequest, PredictionResponse,
    ScheduleRequest, ScheduleResponse, SimulationRequest, SimulationResponse
)
from .scheduler import schedule

app = FastAPI(title="IntelliSched API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    if model.dataset_frame is not None:
        frame = model.dataset_frame
    else:
        frame = pd.read_csv(DATASET)
    return {
        "rows": len(frame),
        "columns": list(frame.columns),
        "target": "next_burst_ms",
        "cpu_utilization": float(frame["cpu_utilization"].mean()) if "cpu_utilization" in frame else 50.0,
    }


@app.get("/api/ml/metrics")
def ml_metrics():
    return {"models": model.metrics}


@app.get("/api/ml/analysis")
def ml_analysis():
    return {"metrics": model.metrics, **model.evaluation}


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
    result, metrics = schedule(request.processes, request.algorithm, lambda f: model.predict(f, "ensemble"))
    return ScheduleResponse(algorithm=request.algorithm, schedule=result, metrics=metrics)


@app.post("/simulate", response_model=SimulationResponse)
def simulate(request: SimulationRequest):
    return SimulationResponse(results={
        algorithm: schedule(request.processes, algorithm, lambda f: model.predict(f, "ensemble"))[1]
        for algorithm in request.algorithms
    })


@app.post("/api/simulation/compare")
def api_compare(request: SimulationRequest):
    global last_simulation
    results = {}
    schedules = {}
    for algorithm in request.algorithms:
        scheduled, metrics = schedule(request.processes, algorithm, lambda f: model.predict(f, "ensemble"))
        results[algorithm] = metrics
        schedules[algorithm] = [item.model_dump() for item in scheduled]
    last_simulation = {"results": results, "schedules": schedules}
    return {
        "results": [{"algorithm": name, **values} for name, values in results.items()],
        "schedules": schedules
    }


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
    samples_left = (25 - (feedback_count % 25)) if (feedback_count % 25) != 0 else (0 if feedback_count > 0 else 25)
    progress = round(((25 - samples_left) / 25.0) * 100.0, 1)
    version = f"v1.{feedback_count // 25}"
    return {
        "status": "Ready" if feedback_count == 0 else f"Active ({feedback_count} feedback samples received)",
        "observations": feedback_count,
        "samples_until_retrain": samples_left,
        "progress_percent": progress,
        "model_version": version
    }


@app.post("/feedback")
def feedback(request: FeedbackRequest):
    global feedback_count
    feedback_count += 1
    model.feedback(request.features, request.actual_burst)
    return {"status": "retrained", "models": model.available_models, "observations": feedback_count}


@app.post("/models/retrain")
def retrain():
    model.train()
    return {"status": "retrained", "models": model.available_models, "observations": feedback_count}


@app.post("/api/adaptive/feedback")
def api_feedback(request: FeedbackRequest):
    return feedback(request)


@app.post("/api/adaptive/feedback/batch")
def api_feedback_batch(request: BatchFeedbackRequest):
    global feedback_count
    for item in request.observations:
        feedback_count += 1
        model.feedback(item.features, item.actual_burst, buffer_only=True)
    # Automatically retrain when reaching interval
    if feedback_count >= 25 and feedback_count % 25 < len(request.observations):
        model.train()
    return {"status": "accepted", "observations": feedback_count, "models": model.available_models}


@app.post("/api/adaptive/retrain")
def api_retrain():
    return retrain()
