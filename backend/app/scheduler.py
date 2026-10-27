from typing import Callable, List
from .schemas import Process, ScheduledProcess


def order_processes(processes: List[Process], algorithm: str, predictor: Callable[[dict], float]) -> List[tuple[Process, float]]:
    entries = [(p, float(p.burst_time or p.actual_burst or predictor(p.features)),
                float(p.burst_time or p.actual_burst or predictor(p.features)))
               for p in processes]
    ordered, clock, remaining = [], 0.0, entries[:]
    while remaining:
        available = [e for e in remaining if e[0].arrival_time <= clock]
        if not available:
            clock = min(e[0].arrival_time for e in remaining)
            available = [e for e in remaining if e[0].arrival_time <= clock]
        if algorithm == "fcfs":
            chosen = min(available, key=lambda e: (e[0].arrival_time, e[0].process_id))
        elif algorithm == "sjf":
            chosen = min(available, key=lambda e: (e[2], e[0].arrival_time, e[0].process_id))
        elif algorithm == "ml-sjf":
            chosen = min(available, key=lambda e: (predictor(e[0].features), e[0].arrival_time, e[0].process_id))
        else:
            chosen = min(available, key=lambda e: (
                predictor(e[0].features) - max(0, clock - e[0].arrival_time) * 0.1,
                e[0].priority, e[0].process_id))
        ordered.append((chosen[0], chosen[1]))
        remaining.remove(chosen)
        clock += chosen[1]
    return ordered


def schedule(processes: List[Process], algorithm: str, predictor: Callable[[dict], float]) -> tuple[List[ScheduledProcess], dict]:
    clock = 0.0
    result = []
    for process, burst in order_processes(processes, algorithm, predictor):
        clock = max(clock, process.arrival_time)
        start = clock
        completion = start + burst
        ready_queue = [
            queued.process_id for queued in processes
            if queued.process_id != process.process_id
            and queued.arrival_time <= start
            and queued.process_id not in {item.process_id for item in result}
        ]
        result.append(ScheduledProcess(
            process_id=process.process_id, start_time=start, completion_time=completion,
            waiting_time=start-process.arrival_time, turnaround_time=completion-process.arrival_time,
            predicted_burst=predictor(process.features) if algorithm in ("ml-sjf", "adaptive") else burst,
            actual_burst=burst, remaining_burst=0.0, state="completed",
            ready_queue=ready_queue))
        clock = completion
    waits = [p.waiting_time for p in result]
    turns = [p.turnaround_time for p in result]
    total_burst = sum(p.completion_time - p.start_time for p in result)
    idle_time = sum(max(0.0, result[i].start_time - (result[i - 1].completion_time if i else 0.0))
                    for i in range(len(result)))
    metrics = {"average_waiting_time": sum(waits)/len(waits) if waits else 0.0,
               "average_turnaround_time": sum(turns)/len(turns) if turns else 0.0,
               "throughput": len(result)/clock if result and clock else 0.0,
               "fairness": 1.0/(1.0 + (max(waits)-min(waits) if waits else 0.0)),
               "cpu_utilization": (total_burst / clock * 100) if clock else 0.0,
               "context_switches": max(0, len(result) - 1),
               "completed_processes": len(result),
               "total_completion_time": clock,
               "idle_time": idle_time,
               "current_time": clock,
               "status": "completed",
               "running_process": ""}
    return result, metrics
