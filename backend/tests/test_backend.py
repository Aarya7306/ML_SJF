from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_health_and_prediction():
    assert client.get("/health").status_code == 200
    response = client.post("/predict", json={"model": "ewma", "features": {
        "prev_burst_1": 10, "prev_burst_2": 8, "prev_burst_3": 6}})
    assert response.status_code == 200
    assert response.json()["prediction"] > 0


def test_schedule_algorithms():
    processes = [{"process_id": "a", "arrival_time": 0, "burst_time": 5},
                 {"process_id": "b", "arrival_time": 0, "burst_time": 2}]
    response = client.post("/schedule", json={"algorithm": "sjf", "processes": processes})
    assert response.status_code == 200
    assert response.json()["schedule"][0]["process_id"] == "b"


def test_empty_simulation():
    response = client.post("/simulate", json={"processes": [], "algorithms": ["fcfs"]})
    assert response.status_code == 200
    assert response.json()["results"]["fcfs"]["throughput"] == 0


def test_api_compare_accepts_frontend_workload_and_preserves_idle_time():
    response = client.post("/api/simulation/compare", json={
        "processes": [
            {"process_id": "late", "arrival_time": 5, "actual_burst": 2, "priority": 1},
            {"process_id": "first", "arrival_time": 0, "actual_burst": 3, "priority": 1},
        ],
        "algorithms": ["fcfs", "sjf", "ml_sjf", "adaptive_ml_sjf"],
    })
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 4
    assert results[0]["throughput"] > 0
    assert response.json()["schedules"]["adaptive_ml_sjf"][0]["state"] == "completed"
    assert "start_time" in response.json()["schedules"]["adaptive_ml_sjf"][0]
    assert "ready_queue" in response.json()["schedules"]["adaptive_ml_sjf"][0]


def test_dataset_summary_and_real_metrics():
    summary = client.get("/api/dataset/summary")
    metrics = client.get("/api/ml/metrics")
    assert summary.status_code == 200
    assert summary.json()["rows"] > 0
    assert {row["model"] for row in metrics.json()["models"]} >= {"ewma", "random_forest", "ensemble"}
