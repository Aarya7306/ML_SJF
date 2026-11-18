from typing import Callable, List
from .schemas import Process, ScheduledProcess


def get_actual_burst(p: Process, default: float = 1.0) -> float:
    if p.actual_burst is not None and p.actual_burst > 0:
        return float(p.actual_burst)
    if p.burst_time is not None and p.burst_time > 0:
        return float(p.burst_time)
    return max(default, 1e-6)


def extract_process_features(process: Process) -> dict:
    feat = dict(process.features or {})
    # Missing predictor inputs must not be derived from actual_burst.
    burst = 10.0
    if "prev_burst_1" not in feat:
        feat["prev_burst_1"] = burst
    if "prev_burst_2" not in feat:
        feat["prev_burst_2"] = burst * 0.95
    if "prev_burst_3" not in feat:
        feat["prev_burst_3"] = burst * 1.05
    if "avg_burst" not in feat:
        feat["avg_burst"] = burst
    if "std_burst" not in feat:
        feat["std_burst"] = max(0.5, burst * 0.1)
    if "ewma_burst_estimate" not in feat:
        feat["ewma_burst_estimate"] = burst
    if "cpu_utilization" not in feat:
        feat["cpu_utilization"] = 50.0
    if "memory_usage_mb" not in feat:
        feat["memory_usage_mb"] = 300.0
    if "thread_count" not in feat:
        feat["thread_count"] = 4
    if "avg_io_wait_ms" not in feat:
        feat["avg_io_wait_ms"] = 10.0
    if "avg_io_count" not in feat:
        feat["avg_io_count"] = 4.0
    return feat


def normalize_algorithm(algorithm: str) -> str:
    cleaned = algorithm.lower().strip().replace("_", "-")
    if cleaned in ("fcfs", "first-come-first-served"):
        return "fcfs"
    if cleaned in ("sjf", "shortest-job-first"):
        return "sjf"
    if cleaned in ("ml-sjf", "mlsjf", "ml"):
        return "ml-sjf"
    return "adaptive-ml-sjf"


def order_processes(
    processes: List[Process],
    algorithm: str,
    predictor: Callable[[dict], float],
    aging_factor: float = 0.10
) -> List[tuple[Process, float, float]]:
    algo = normalize_algorithm(algorithm)

    # Precompute prediction and actual burst for each process
    pred_map = {p.process_id: max(float(predictor(extract_process_features(p))), 1e-6) for p in processes}
    actual_map = {p.process_id: get_actual_burst(p, default=pred_map[p.process_id]) for p in processes}

    ordered: List[tuple[Process, float, float]] = []
    clock = 0.0
    remaining = list(processes)

    while remaining:
        available = [p for p in remaining if p.arrival_time <= clock]
        if not available:
            clock = min(p.arrival_time for p in remaining)
            available = [p for p in remaining if p.arrival_time <= clock]

        if algo == "fcfs":
            chosen = min(available, key=lambda p: (p.arrival_time, p.process_id))
        elif algo == "sjf":
            chosen = min(available, key=lambda p: (actual_map[p.process_id], p.arrival_time, p.process_id))
        elif algo == "ml-sjf":
            chosen = min(available, key=lambda p: (pred_map[p.process_id], p.arrival_time, p.process_id))
        else:  # adaptive-ml-sjf
            chosen = min(
                available,
                key=lambda p: (
                    pred_map[p.process_id] - max(0.0, clock - p.arrival_time) * aging_factor,
                    p.priority,
                    p.process_id
                )
            )

        act_burst = actual_map[chosen.process_id]
        pred_burst = pred_map[chosen.process_id]
        ordered.append((chosen, act_burst, pred_burst))
        remaining.remove(chosen)
        clock += act_burst

    return ordered


def schedule(
    processes: List[Process],
    algorithm: str,
    predictor: Callable[[dict], float],
    aging_factor: float = 0.10
) -> tuple[List[ScheduledProcess], dict]:
    if not processes:
        empty_metrics = {
            "average_waiting_time": 0.0,
            "average_turnaround_time": 0.0,
            "average_response_time": 0.0,
            "maximum_waiting_time": 0.0,
            "throughput": 0.0,
            "fairness": 1.0,
            "cpu_utilization": 0.0,
            "context_switches": 0,
            "completed_processes": 0,
            "total_completion_time": 0.0,
            "idle_time": 0.0,
            "current_time": 0.0,
            "status": "completed",
            "running_process": ""
        }
        return [], empty_metrics

    algo = normalize_algorithm(algorithm)
    is_ml_algo = algo in ("ml-sjf", "adaptive-ml-sjf")

    clock = 0.0
    result: List[ScheduledProcess] = []
    ordered = order_processes(processes, algorithm, predictor, aging_factor=aging_factor)

    for process, actual_burst, pred_burst in ordered:
        clock = max(clock, process.arrival_time)
        start = clock
        completion = start + actual_burst
        ready_queue = [
            queued.process_id for queued in processes
            if queued.process_id != process.process_id
            and queued.arrival_time <= start
            and queued.process_id not in {item.process_id for item in result}
        ]

        result.append(ScheduledProcess(
            process_id=process.process_id,
            start_time=start,
            completion_time=completion,
            waiting_time=start - process.arrival_time,
            turnaround_time=completion - process.arrival_time,
            response_time=start - process.arrival_time,
            predicted_burst=pred_burst if is_ml_algo else actual_burst,
            adjusted_burst=(
                pred_burst - (start - process.arrival_time) * aging_factor
                if algo == "adaptive-ml-sjf" else pred_burst
            ),
            waiting_adjustment=(
                (start - process.arrival_time) * aging_factor
                if algo == "adaptive-ml-sjf" else 0.0
            ),
            selection_reason=(
                "Selected by lowest adjusted burst: "
                f"{pred_burst - (start - process.arrival_time) * aging_factor:.2f} ms."
                if algo == "adaptive-ml-sjf"
                else f"Selected by {algo.upper()} ordering."
            ),
            actual_burst=actual_burst,
            remaining_burst=0.0,
            state="completed",
            ready_queue=ready_queue
        ))
        clock = completion

    waits = [p.waiting_time for p in result]
    turns = [p.turnaround_time for p in result]
    total_burst = sum(p.completion_time - p.start_time for p in result)
    idle_time = sum(
        max(0.0, result[i].start_time - (result[i - 1].completion_time if i else 0.0))
        for i in range(len(result))
    )

    metrics = {
        "average_waiting_time": sum(waits) / len(waits) if waits else 0.0,
        "average_turnaround_time": sum(turns) / len(turns) if turns else 0.0,
        "average_response_time": sum(p.response_time for p in result) / len(result) if result else 0.0,
        "maximum_waiting_time": max(waits) if waits else 0.0,
        "throughput": len(result) / clock if result and clock else 0.0,
        "fairness": 1.0 / (1.0 + (max(waits) - min(waits) if waits else 0.0)),
        "cpu_utilization": (total_burst / clock * 100) if clock else 0.0,
        "context_switches": max(0, len(result) - 1),
        "completed_processes": len(result),
        "total_completion_time": clock,
        "idle_time": idle_time,
        "current_time": clock,
        "status": "completed",
        "running_process": ""
    }
    return result, metrics
