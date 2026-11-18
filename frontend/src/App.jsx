import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, BrainCircuit, CheckCircle2, Cpu, Database, Gauge,
  LayoutDashboard, ListOrdered, Play, RefreshCw, Target, Timer, TrendingUp
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis
} from 'recharts'
import { api } from './services/api'

const algorithms = ['fcfs', 'sjf', 'ml_sjf', 'adaptive_ml_sjf']
const defaultProcesses = [
  { process_id: 'P1', arrival_time: 0, actual_burst: 12, priority: 2 },
  { process_id: 'P2', arrival_time: 1, actual_burst: 7, priority: 1 },
  { process_id: 'P3', arrival_time: 3, actual_burst: 18, priority: 3 },
  { process_id: 'P4', arrival_time: 5, actual_burst: 5, priority: 2 }
]
const pages = [
  ['Overview', LayoutDashboard, 'overview'],
  ['Processes', Cpu, 'processes'],
  ['Scheduling Comparison', BarChart3, 'comparison'],
  ['ML Model Analysis', BrainCircuit, 'ml'],
  ['Adaptive Scheduler Analysis', TrendingUp, 'adaptive']
]

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>
}

function Button({ children, onClick, variant = 'primary', disabled = false, className = '' }) {
  return <button className={`button ${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

function Empty({ text }) {
  return <div className="empty"><BarChart3 size={28} /><span>{text}</span></div>
}

function Metric({ icon: Icon, label, value, note, accent = 'blue' }) {
  return (
    <Card className="metric">
      <div className={`metric-icon ${accent}`}><Icon size={19} /></div>
      <div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{note}</small></div>
    </Card>
  )
}

function formatAlgorithm(name) {
  return (name || '').replaceAll('_', '-').toUpperCase()
}

function SmallScatterPoint({ cx, cy, fill }) {
  return <circle cx={cx} cy={cy} r={2.25} fill={fill} fillOpacity={0.46} />
}

function ActualPredictedTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip">
      <b>Held-out observation</b>
      <span>Actual: {Number(point.actual).toFixed(2)} ms</span>
      <span>Predicted: {Number(point.predicted).toFixed(2)} ms</span>
    </div>
  )
}

function ResidualTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip">
      <b>Held-out observation</b>
      <span>Predicted: {Number(point.predicted).toFixed(2)} ms</span>
      <span>Actual: {Number(point.actual).toFixed(2)} ms</span>
      <span>Residual: {Number(point.residual).toFixed(2)} ms</span>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [processes, setProcesses] = useState(defaultProcesses)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info')

  const notify = (text, type = 'info') => {
    setMessage(text)
    setMessageType(type)
  }

  const loadData = async () => {
    setAnalysisLoading(true)
    try {
      const [summaryData, analysisData] = await Promise.all([api.summary(), api.analysis()])
      setSummary(summaryData)
      setAnalysis(analysisData)
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setAnalysisLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const run = async () => {
    const ids = processes.map(process => process.process_id.trim())
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      notify('Each process must have a unique Process ID.', 'warning')
      return
    }
    if (processes.some(process => Number(process.actual_burst) <= 0 || Number(process.arrival_time) < 0)) {
      notify('Arrival time must be non-negative and burst time must be greater than zero.', 'warning')
      return
    }

    setLoading(true)
    notify('Running the identical workload through all four policies...')
    try {
      const simulation = await api.compare({
        processes: processes.map(process => ({
          ...process,
          process_id: process.process_id.trim(),
          arrival_time: Number(process.arrival_time),
          actual_burst: Number(process.actual_burst),
          priority: Number(process.priority)
        })),
        algorithms
      })
      if (!simulation?.results?.length || simulation.results.length !== algorithms.length) {
        throw new Error('The simulation did not return all four policy results.')
      }
      setResults(simulation)
      setPage('comparison')
      notify('Simulation completed successfully.', 'success')
    } catch (error) {
      notify(error.message, 'warning')
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => (results?.results || []).map(result => ({
    name: formatAlgorithm(result.algorithm),
    algorithm: result.algorithm,
    waiting: Number(result.average_waiting_time || 0),
    turnaround: Number(result.average_turnaround_time || 0),
    response: Number(result.average_response_time || 0),
    utilization: Number(result.cpu_utilization || 0),
    throughput: Number(result.throughput || 0),
    maximumWaiting: Number(result.maximum_waiting_time || 0)
  })), [results])

  const title = pages.find(item => item[2] === page)?.[0] || 'Overview'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Cpu size={20} /></div><div><b>IntelliSched</b><span>Adaptive CPU scheduler</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav>{pages.map(([label, Icon, key]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><Icon size={18} /><span>{label}</span></button>
        ))}</nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="breadcrumb">INTELLISCHED / {title.toUpperCase()}</span><h1>{title}</h1></div>
          <div className="top-actions">
            <Button variant="secondary" onClick={loadData} disabled={analysisLoading}><RefreshCw size={14} /> Refresh</Button>
            <Button onClick={run} disabled={loading}><Play size={14} /> {loading ? 'Running...' : 'Run Simulation'}</Button>
          </div>
        </header>
        {message && <div className={`alert ${messageType === 'success' ? 'success' : ''}`}><span>{message}</span><button className="icon-button" onClick={() => setMessage('')}>×</button></div>}

        {page === 'overview' && <Overview summary={summary} analysis={analysis} chartData={chartData} results={results} navigate={setPage} run={run} loading={loading} />}
        {page === 'processes' && <Processes processes={processes} setProcesses={setProcesses} run={run} loading={loading} />}
        {page === 'comparison' && <Comparison results={results} chartData={chartData} run={run} loading={loading} />}
        {page === 'ml' && <ModelAnalysis analysis={analysis} loading={analysisLoading} />}
        {page === 'adaptive' && <AdaptiveAnalysis results={results} chartData={chartData} />}
      </main>
    </div>
  )
}

function Overview({ summary, analysis, chartData, results, navigate, run, loading }) {
  return (
    <>
      <div className="hero"><div>
        <span className="tag"><Cpu size={14} /> ADAPTIVE ML-BASED CPU SCHEDULER</span>
        <h2>Understand every<br /><em>scheduling decision.</em></h2>
        <p>Configure one workload and compare FCFS, SJF, ML-SJF, and Adaptive-ML-SJF with genuine backend metrics.</p>
        <Button onClick={run} disabled={loading}><Play size={14} /> {loading ? 'Running...' : 'Run Comparison'}</Button>
      </div><div className="hero-orbit"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-center"><Cpu size={28} /><span>CPU</span></div></div></div>

      <div className="section-heading"><div><h3>System Overview</h3><span>Dataset, model and latest simulation status</span></div></div>
      <div className="metric-grid">
        <Metric icon={Database} label="Dataset Records" value={summary?.rows ? Number(summary.rows).toLocaleString() : '—'} note="sjf_ml_training_dataset.csv" />
        <Metric icon={Target} label="ML Features" value={analysis?.feature_count || '—'} note="Used by the estimators" accent="violet" />
        <Metric icon={CheckCircle2} label="Latest Simulation" value={results ? 'Completed' : 'Not run'} note={results ? `${results.results?.[0]?.completed_processes || 0} processes` : 'Run a workload'} accent="green" />
        <Metric icon={Gauge} label="Policies" value="4" note="Independent executions" accent="orange" />
      </div>

      <div className="content-grid">
        <Card><div className="card-title"><div><h3>Average Waiting Time</h3><span>Latest simulation by policy</span></div><BarChart3 size={18} /></div>
          {chartData.length ? <PerformanceChart data={chartData} dataKeys={[['waiting', 'Waiting (ms)', '#4361ee']]} /> : <Empty text="Run a simulation to populate this chart." />}
        </Card>
        <Card><div className="card-title"><div><h3>Quick Navigation</h3><span>Jump to a workspace section</span></div><ListOrdered size={18} /></div>
          <div className="quick-links">
            <Button variant="secondary" onClick={() => navigate('processes')}>Configure Processes</Button>
            <Button variant="secondary" onClick={() => navigate('comparison')}>View Comparison</Button>
            <Button variant="secondary" onClick={() => navigate('ml')}>Inspect ML Models</Button>
            <Button variant="secondary" onClick={() => navigate('adaptive')}>Explain Adaptive Scheduler</Button>
          </div>
        </Card>
      </div>
    </>
  )
}

function Processes({ processes, setProcesses, run, loading }) {
  const update = (index, key, value) => setProcesses(processes.map((process, processIndex) => {
    if (processIndex !== index) return process
    if (key === 'process_id') return { ...process, process_id: value }
    return { ...process, [key]: value === '' ? '' : Math.max(0, Number(value)) }
  }))

  const addProcess = () => setProcesses([...processes, { process_id: `P${processes.length + 1}`, arrival_time: 0, actual_burst: 10, priority: 1 }])

  return (
    <>
      <div className="page-intro"><div><h2>Process Manager</h2><p>The same workload is sent independently to all four algorithms.</p></div>
        <div style={{ display: 'flex', gap: 10 }}><Button variant="secondary" onClick={() => setProcesses([...defaultProcesses])}>Reset</Button><Button onClick={run} disabled={loading}><Play size={14} /> Run Simulation</Button></div>
      </div>
      <Card><div className="table-wrap"><table><thead><tr><th>Process ID</th><th>Arrival Time (ms)</th><th>Burst Time (ms)</th><th>Priority</th><th /></tr></thead>
        <tbody>{processes.map((process, index) => <tr key={`${process.process_id}-${index}`}>
          <td><input value={process.process_id} onChange={event => update(index, 'process_id', event.target.value)} /></td>
          <td><input type="number" min="0" step="any" value={process.arrival_time} onChange={event => update(index, 'arrival_time', event.target.value)} /></td>
          <td><input type="number" min="0.1" step="any" value={process.actual_burst} onChange={event => update(index, 'actual_burst', event.target.value)} /></td>
          <td><input type="number" min="1" step="1" value={process.priority} onChange={event => update(index, 'priority', event.target.value)} /></td>
          <td><button className="icon-button" title="Delete process" onClick={() => setProcesses(processes.filter((_, itemIndex) => itemIndex !== index))}>×</button></td>
        </tr>)}</tbody>
      </table></div></Card>
    </>
  )
}

function Comparison({ results, chartData, run, loading }) {
  const [activeAlgorithm, setActiveAlgorithm] = useState('adaptive_ml_sjf')
  const events = results?.schedules?.[activeAlgorithm] || []
  const sjfResult = chartData.find(result => result.algorithm === 'sjf')
  const mlResult = chartData.find(result => result.algorithm === 'ml_sjf')
  const resultsDiffer = sjfResult && mlResult
    && Math.abs(sjfResult.waiting - mlResult.waiting) > 0.005
  return (
    <>
      <div className="page-intro"><div><h2>Scheduling Comparison</h2><p>Four independent executions against the identical workload.</p></div><Button onClick={run} disabled={loading}><RefreshCw size={14} /> {loading ? 'Running...' : 'Run Again'}</Button></div>
      <div className="metric-grid">
        <Metric icon={Timer} label="Avg Waiting" value={metricAverage(chartData, 'waiting')} note="Milliseconds" />
        <Metric icon={Activity} label="Avg Turnaround" value={metricAverage(chartData, 'turnaround')} note="Milliseconds" accent="violet" />
        <Metric icon={Gauge} label="CPU Utilization" value={metricAverage(chartData, 'utilization', '%')} note="Across policies" accent="orange" />
      </div>
      <Card><div className="card-title"><div><h3>Policy Metrics</h3><span>Waiting and turnaround times. In non-preemptive scheduling, response time equals waiting time.</span></div></div>{chartData.length ? <PerformanceChart data={chartData} dataKeys={[['waiting', 'Waiting (ms)', '#4361ee'], ['turnaround', 'Turnaround (ms)', '#06b6d4']]} /> : <Empty text="Run the simulation to generate genuine results." />}</Card>
      {sjfResult && mlResult && (
        <Card className="comparison-note">
          <b>SJF vs ML-SJF:</b>{' '}
          {resultsDiffer
            ? `SJF averages ${sjfResult.waiting.toFixed(2)} ms waiting because it uses actual burst times, while ML-SJF averages ${mlResult.waiting.toFixed(2)} ms because it uses model predictions.`
            : 'Both policies currently produce the same result for this workload; a real difference requires the ML predictions to change the selected process order.'}
        </Card>
      )}
      <Card><div className="card-title"><div><h3>Results Table</h3><span>Each row comes from a separate backend scheduling run</span></div></div>
        {chartData.length ? <div className="table-wrap"><table><thead><tr><th>Algorithm</th><th>Avg Waiting</th><th>Avg Turnaround</th><th>CPU Utilization</th><th>Throughput</th></tr></thead><tbody>
          {chartData.map(result => <tr key={result.algorithm}><td><b>{result.name}</b></td><td>{result.waiting.toFixed(2)} ms</td><td>{result.turnaround.toFixed(2)} ms</td><td>{result.utilization.toFixed(1)}%</td><td>{result.throughput.toFixed(3)} / ms</td></tr>)}
        </tbody></table></div> : <Empty text="No result table yet." />}
      </Card>
      <Card><div className="card-title"><div><h3>Execution Order & Gantt Chart</h3><span>Select a policy to inspect its independent schedule.</span></div></div>
        <div className="algo-pills">{algorithms.map(algorithm => <button key={algorithm} className={`algo-pill ${activeAlgorithm === algorithm ? 'active' : ''}`} onClick={() => setActiveAlgorithm(algorithm)}>{formatAlgorithm(algorithm)}</button>)}</div>
        {events.length ? <><Gantt events={events} /><div className="table-wrap"><table><thead><tr><th>Order</th><th>Process</th><th>Start</th><th>End</th><th>Waiting</th><th>Response</th></tr></thead><tbody>
          {events.map((event, index) => <tr key={event.process_id}><td>{index + 1}</td><td><b>{event.process_id}</b></td><td>{Number(event.start_time).toFixed(2)} ms</td><td>{Number(event.completion_time).toFixed(2)} ms</td><td>{Number(event.waiting_time).toFixed(2)} ms</td><td>{Number(event.response_time).toFixed(2)} ms</td></tr>)}
        </tbody></table></div></> : <Empty text="Run a simulation to view schedules." />}
      </Card>
    </>
  )
}

function ModelAnalysis({ analysis, loading }) {
  const [selectedModel, setSelectedModel] = useState('ensemble')
  const metrics = analysis?.metrics || []
  const points = (analysis?.points || []).map(point => ({ actual: point.actual, predicted: point.predictions?.[selectedModel] })).filter(point => Number.isFinite(point.predicted))
  const residuals = points.map(point => ({
    actual: point.actual,
    predicted: point.predicted,
    residual: point.actual - point.predicted
  }))
  const scatterMax = points.length ? Math.max(...points.flatMap(point => [point.actual, point.predicted])) * 1.05 : 1
  const importance = Object.entries(analysis?.feature_importance?.random_forest || {}).map(([feature, value]) => ({ feature, importance: value })).sort((a, b) => b.importance - a.importance).slice(0, 10)

  if (loading) return <Card><Empty text="Loading held-out model evaluation..." /></Card>
  if (!analysis?.metrics?.length) return <Card><Empty text="No cached model evaluation is available." /></Card>

  return (
    <>
      <div className="page-intro"><div><h2>ML Model Analysis</h2><p>Offline evaluation uses the held-out test split and cached model outputs.</p></div></div>
      <div className="metric-grid"><Metric icon={Database} label="Dataset Rows" value={analysis.dataset_rows?.toLocaleString() || '—'} note={`sjf_ml_training_dataset.csv · ${analysis.train_rows || 0} train / ${analysis.test_rows || 0} test`} /><Metric icon={Target} label="Feature Count" value={analysis.feature_count || 0} note="Model input columns" accent="violet" /><Metric icon={BrainCircuit} label="Models" value={metrics.length} note="Available evaluation rows" accent="green" /><Metric icon={CheckCircle2} label="Evaluation" value="Held-out" note="No live data leakage" accent="orange" /></div>
      <Card><div className="card-title"><div><h3>Model Metrics</h3><span>MAE, RMSE and R² on actual test targets</span></div></div><div className="table-wrap"><table><thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>R²</th><th>Training Time</th></tr></thead><tbody>{metrics.map(metric => <tr key={metric.model}><td><button className={`text-button ${selectedModel === metric.model ? 'selected' : ''}`} onClick={() => setSelectedModel(metric.model)}><b>{metric.model}</b></button></td><td>{Number(metric.mae).toFixed(3)}</td><td>{Number(metric.rmse).toFixed(3)}</td><td>{Number(metric.r2).toFixed(3)}</td><td>{Number(metric.training_time_ms).toFixed(1)} ms</td></tr>)}</tbody></table></div></Card>
      <div className="content-grid">
        <Card>
          <div className="card-title"><div><h3>Actual vs Predicted</h3><span>{selectedModel} on held-out rows</span></div></div>
          {points.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 52, left: 24 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="Actual CPU Burst Time"
                  unit=" ms"
                  domain={[0, scatterMax]}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  label={{ value: 'Actual CPU Burst Time (ms)', position: 'insideBottom', offset: -28, fill: '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="Predicted CPU Burst Time"
                  unit=" ms"
                  domain={[0, scatterMax]}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  width={72}
                  label={{ value: 'Predicted CPU Burst Time (ms)', angle: -90, position: 'insideLeft', offset: 8, fill: '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<ActualPredictedTooltip />} />
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: scatterMax, y: scatterMax }]}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  ifOverflow="extendDomain"
                />
                <Scatter name="Held-out observations" data={points} fill="#4361ee" shape={<SmallScatterPoint />} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Selected model has no held-out predictions." />
          )}
        </Card>
        <Card>
          <div className="card-title"><div><h3>Residual vs Predicted</h3><span>{selectedModel}: Actual minus Predicted</span></div></div>
          {residuals.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 12, right: 24, bottom: 52, left: 24 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="predicted"
                  name="Predicted CPU Burst Time"
                  unit=" ms"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  label={{ value: 'Predicted CPU Burst Time (ms)', position: 'insideBottom', offset: -28, fill: '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  type="number"
                  dataKey="residual"
                  name="Residual Error"
                  unit=" ms"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  width={72}
                  label={{ value: 'Residual Error (ms)', angle: -90, position: 'insideLeft', offset: 8, fill: '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={<ResidualTooltip />} />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} ifOverflow="extendDomain" />
                <Scatter name="Residual observations" data={residuals} fill="#8b5cf6" shape={<SmallScatterPoint />} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No residual data." />
          )}
        </Card>
      </div>
      <Card><div className="card-title"><div><h3>Feature Importance</h3><span>Random Forest importance from the trained model</span></div></div>{importance.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={importance} layout="vertical" margin={{ left: 30 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="feature" width={140} fontSize={10} /><Tooltip /><Bar dataKey="importance" fill="#06b6d4" /></BarChart></ResponsiveContainer> : <Empty text="Feature importance is unavailable." />}</Card>
    </>
  )
}

function AdaptiveAnalysis({ results, chartData }) {
  const events = results?.schedules?.adaptive_ml_sjf || []
  const mlEvents = results?.schedules?.ml_sjf || []
  const sameOrder = events.length > 0 && events.length === mlEvents.length
    && events.every((event, index) => event.process_id === mlEvents[index]?.process_id)
  const mlResult = chartData.find(result => result.algorithm === 'ml_sjf')
  const adaptiveResult = chartData.find(result => result.algorithm === 'adaptive_ml_sjf')
  const comparison = [mlResult, adaptiveResult].filter(Boolean)
  return (
    <>
      <div className="page-intro"><div><h2>Adaptive Scheduler Analysis</h2><p>Adaptive-ML-SJF uses Adjusted Burst = Predicted Burst − (Waiting Time × 0.10).</p>{sameOrder && <small className="muted">The current workload produces the same order as ML-SJF; this is valid when the adjustment does not change the ranking.</small>}</div></div>
      <div className="metric-grid"><Metric icon={Timer} label="Maximum Waiting" value={events.length ? `${Math.max(...events.map(event => event.waiting_time)).toFixed(2)} ms` : '—'} note="Adaptive schedule" /><Metric icon={Gauge} label="Average Waiting" value={adaptiveResult ? `${adaptiveResult.waiting.toFixed(2)} ms` : '—'} note="Adaptive schedule" accent="violet" /><Metric icon={TrendingUp} label="Adjustment Factor" value="0.10" note="Waiting-time multiplier" accent="green" /><Metric icon={ListOrdered} label="Selection Order" value={events.length || '—'} note="Completed processes" accent="orange" /></div>
      <Card><div className="card-title"><div><h3>ML-SJF vs Adaptive-ML-SJF</h3><span>Independent metrics from the same workload</span></div></div>{comparison.length ? <PerformanceChart data={comparison} dataKeys={[['waiting', 'Waiting (ms)', '#4361ee'], ['turnaround', 'Turnaround (ms)', '#06b6d4']]} /> : <Empty text="Run a simulation to compare adaptive scheduling." />}</Card>
      <Card><div className="card-title"><div><h3>Adaptive Process Decisions</h3><span>Predicted burst, waiting adjustment and selection explanation</span></div></div>{events.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Process</th><th>Predicted</th><th>Waiting</th><th>Adjustment</th><th>Adjusted Burst</th><th>Why selected</th></tr></thead><tbody>{events.map((event, index) => <tr key={event.process_id}><td>{index + 1}</td><td><b>{event.process_id}</b></td><td>{Number(event.predicted_burst).toFixed(2)} ms</td><td>{Number(event.waiting_time).toFixed(2)} ms</td><td>{Number(event.waiting_adjustment).toFixed(2)} ms</td><td>{Number(event.adjusted_burst).toFixed(2)} ms</td><td>{event.selection_reason}</td></tr>)}</tbody></table></div> : <Empty text="Run a simulation to inspect adaptive decisions." />}</Card>
    </>
  )
}

function PerformanceChart({ data, dataKeys }) {
  return <ResponsiveContainer width="100%" height={280}><BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" fontSize={10} stroke="#64748b" /><YAxis fontSize={11} stroke="#64748b" /><Tooltip /><>{dataKeys.map(([key, label, fill]) => <Bar key={key} dataKey={key} fill={fill} name={label} radius={[4, 4, 0, 0]} />)}</></BarChart></ResponsiveContainer>
}

function Gantt({ events }) {
  const blocks = []
  let clock = 0
  events.forEach(event => {
    if (event.start_time > clock) blocks.push({ process_id: 'IDLE', duration: event.start_time - clock, start: clock, end: event.start_time, idle: true })
    blocks.push({ process_id: event.process_id, duration: event.completion_time - event.start_time, start: event.start_time, end: event.completion_time })
    clock = event.completion_time
  })
  const totalTime = Math.max(clock, 1)
  return (
    <div className="gantt-scale">
      <div className="gantt-axis"><span>0 ms</span><span>{totalTime.toFixed(1)} ms</span></div>
      <div className="gantt">
        {blocks.map((block, index) => (
          <div
            key={`${block.process_id}-${index}`}
            className={`gantt-item ${block.idle ? 'idle' : ''}`}
            style={{ width: `${Math.max((block.duration / totalTime) * 100, 8)}%` }}
            title={`${block.process_id}: ${Number(block.start).toFixed(1)} - ${Number(block.end).toFixed(1)} ms`}
          >
            <b>{block.process_id}</b>
            <small>{Number(block.start).toFixed(1)}–{Number(block.end).toFixed(1)} ms</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function metricAverage(data, key, suffix = ' ms') {
  if (!data.length) return '—'
  return `${(data.reduce((sum, item) => sum + item[key], 0) / data.length).toFixed(2)}${suffix}`
}
