from typing import Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

Algorithm = Literal["fcfs", "sjf", "ml-sjf", "adaptive", "ml_sjf", "adaptive_ml_sjf"]


class Process(BaseModel):
    process_id: str
    arrival_time: float = Field(0, ge=0)
    burst_time: Optional[float] = Field(None, gt=0)
    actual_burst: Optional[float] = Field(None, gt=0)
    priority: int = 0
    features: Dict[str, float] = Field(default_factory=dict)


class PredictionRequest(BaseModel):
    features: Dict[str, float] = Field(default_factory=dict)
    model: Literal["ensemble", "ewma", "random_forest", "xgboost"] = "ensemble"


class PredictionResponse(BaseModel):
    prediction: float
    model: str
    available_models: List[str]


class ScheduleRequest(BaseModel):
    processes: List[Process]
    algorithm: Algorithm = "adaptive"


class ScheduledProcess(BaseModel):
    process_id: str
    start_time: float
    completion_time: float
    waiting_time: float
    turnaround_time: float
    predicted_burst: float
    actual_burst: float = 0.0
    remaining_burst: float = 0.0
    state: str = "completed"
    ready_queue: List[str] = Field(default_factory=list)


class ScheduleResponse(BaseModel):
    algorithm: str
    schedule: List[ScheduledProcess]
    metrics: Dict[str, Union[float, str]]


class FeedbackRequest(BaseModel):
    features: Dict[str, float]
    actual_burst: float = Field(gt=0)


class SimulationRequest(BaseModel):
    processes: List[Process]
    algorithms: List[Algorithm] = ["fcfs", "sjf", "ml-sjf", "adaptive"]

    @property
    def normalized_algorithms(self) -> List[str]:
        return [a.replace("_", "-") for a in self.algorithms]


class SimulationResponse(BaseModel):
    results: Dict[str, Dict[str, Union[float, str]]]
