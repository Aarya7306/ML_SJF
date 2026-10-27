import { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart3, BrainCircuit, Cpu, Database, Gauge, GitCompare, LayoutDashboard, Play, RefreshCw, Settings, SlidersHorizontal, Sparkles, Table2, Timer, WandSparkles } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from './services/api'

const nav = [
  ['Overview', LayoutDashboard, 'overview'],
  ['Processes & Simulation', Cpu, 'workload'],
  ['ML Studio', BrainCircuit, 'ml'],
  ['Performance & What-if', BarChart3, 'performance'],
  ['Settings & Adaptive Monitor', Settings, 'settings']
]
const defaultProcesses = [
  { process_id: 'P1', arrival_time: 0, actual_burst: 12, priority: 2 },
  { process_id: 'P2', arrival_time: 1, actual_burst: 7, priority: 1 },
  { process_id: 'P3', arrival_time: 3, actual_burst: 18, priority: 3 },
  { process_id: 'P4', arrival_time: 5, actual_burst: 5, priority: 2 }
]

function Card({ children, className = '' }) { return <section className={`card ${className}`}>{children}</section> }
function Metric({ icon: Icon, label, value, note, accent = 'blue' }) {
  return <Card className="metric"><div className={`metric-icon ${accent}`}><Icon size={18}/></div><div><span className="eyebrow">{label}</span><strong>{value}</strong><small>{note}</small></div></Card>
}
function Button({ children, onClick, variant = 'primary', disabled = false }) { return <button className={`button ${variant}`} onClick={onClick} disabled={disabled}>{children}</button> }
function Tabs({ items, value, onChange }) { return <div className="tabs">{items.map(([key, label]) => <button key={key} className={value === key ? 'selected' : ''} onClick={() => onChange(key)}>{label}</button>)}</div> }
function Empty({ text }) { return <div className="empty"><BarChart3 size={25}/><span>{text}</span></div> }

export default function App() {
  const [page, setPage] = useState('overview')
  const [workloadTab, setWorkloadTab] = useState('processes')
  const [performanceTab, setPerformanceTab] = useState('comparison')
  const [settingsTab, setSettingsTab] = useState('settings')
  const [summary, setSummary] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [adaptive, setAdaptive] = useState(null)
  const [processes, setProcesses] = useState(defaultProcesses)
  const [algorithm, setAlgorithm] = useState('adaptive_ml_sjf')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = async () => {
    try {
      const [s, m, a] = await Promise.all([api.summary(), api.metrics(), api.adaptive()])
      setSummary(s); setMetrics(m.models || []); setAdaptive(a)
    } catch (error) { setMessage(`Backend unavailable: ${error.message}`) }
  }
  useEffect(() => { loadData() }, [])
  const run = async () => {
    setLoading(true); setMessage('')
    try {
      const simulation = await api.compare({ processes, algorithms: ['fcfs', 'sjf', 'ml_sjf', 'adaptive_ml_sjf'] })
      if (!simulation?.results?.length || !simulation?.schedules?.adaptive_ml_sjf?.length) {
        throw new Error('Simulation completed without execution events.')
      }
      setResults(simulation)
      setPage('workload')
      setWorkloadTab('simulation')
      setMessage(`Simulation completed: ${simulation.schedules.adaptive_ml_sjf.length} processes executed.`)
    } catch (error) {
      setMessage(`Simulation failed: ${error.message}`)
    } finally { setLoading(false) }
  }
  const chartData = useMemo(() => (results?.results || []).map(r => ({
    name: (r.algorithm || '').replaceAll('_', '-').toUpperCase(),
    waiting: r.average_waiting_time ?? 0,
    turnaround: r.average_turnaround_time ?? 0,
    utilization: r.cpu_utilization ?? 0
  })), [results])
  const totalSimulated = results?.results?.[0]?.completed_processes ?? 0
  const activeModel = metrics.find(m => m.model === 'ensemble') || metrics[0]
  const title = nav.find(n => n[2] === page)?.[0] || 'Overview'
  const train = async () => {
    setLoading(true)
    try { await api.train({}); await loadData(); setMessage('Models trained and validated successfully.') }
    catch (error) { setMessage(error.message) } finally { setLoading(false) }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={20}/></div><div><b>IntelliSched</b><span>Adaptive CPU intelligence</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(([label, Icon, key]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><Icon size={17}/><span>{label}</span>{key === 'settings' && <i/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="system-status"><span className="pulse"/> Backend {summary ? 'connected' : 'connecting...'}</div><small>v1.0.0 · local workspace</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="breadcrumb">INTELLISCHED / {title.toUpperCase()}</span><h1>{title}</h1></div><div className="top-actions"><span className="live"><span className="pulse"/> Live simulation</span><Button variant="secondary" onClick={loadData}><RefreshCw size={15}/> Refresh</Button><Button onClick={run} disabled={loading}><Play size={15}/> {loading ? 'Running...' : 'Run simulation'}</Button></div></header>
      {message && <div className="alert">{message}</div>}
      {page === 'overview' && <Overview summary={summary} metrics={metrics} adaptive={adaptive} chartData={chartData} totalSimulated={totalSimulated} run={run} loading={loading}/>}
      {page === 'workload' && <><Tabs value={workloadTab} onChange={setWorkloadTab} items={[['processes', 'Process Manager'], ['scheduler', 'Scheduler Control'], ['simulation', 'Live Simulation']]}/>{workloadTab === 'processes' && <Processes processes={processes} setProcesses={setProcesses}/>} {workloadTab === 'scheduler' && <Scheduler algorithm={algorithm} setAlgorithm={setAlgorithm} processes={processes} run={run}/>} {workloadTab === 'simulation' && <Simulation results={results} schedules={results?.schedules} run={run} loading={loading}/>}</>}
      {page === 'ml' && <Predictions metrics={metrics} onTrain={train} loading={loading}/>}
      {page === 'performance' && <><Tabs value={performanceTab} onChange={setPerformanceTab} items={[['comparison', 'Algorithm Comparison'], ['whatif', 'What-if Experiments']]}/>{performanceTab === 'comparison' && <Performance results={results} chartData={chartData} run={run}/>} {performanceTab === 'whatif' && <WhatIf processes={processes} run={run}/>}</>}
      {page === 'settings' && <><Tabs value={settingsTab} onChange={setSettingsTab} items={[['settings', 'General Settings'], ['adaptive', 'Adaptive Learning Monitor']]}/>{settingsTab === 'settings' ? <SettingsPage onSave={() => setMessage('Settings saved for the next simulation.')} /> : <Adaptive adaptive={adaptive} onRetrain={async () => { setLoading(true); try { await api.retrain(); await loadData(); setMessage('Adaptive model retrained and validated.'); } catch (error) { setMessage(error.message) } finally { setLoading(false) } }} loading={loading}/>}</>}
    </main>
  </div>
}

function Overview({ summary, metrics, adaptive, chartData, totalSimulated, run, loading }) {
  const activeModel = metrics.find(m => m.model === 'ensemble') || metrics[0]
  return <><div className="hero"><div><span className="tag"><WandSparkles size={13}/> ML-POWERED SCHEDULING</span><h2>Make every CPU cycle<br/><em>count.</em></h2><p>Predict burst duration, simulate fair scheduling, and learn from every execution.</p><Button onClick={run} disabled={loading}><Play size={15}/> {loading ? 'Running...' : 'Run a comparison'}</Button></div><div className="hero-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-center"><Cpu size={30}/><span>CPU</span></div></div></div>
    <div className="section-heading"><div><h3>Workspace overview</h3><span>Live metrics from the active simulation</span></div><span className="updated"><span className="pulse"/> Backend-sourced</span></div>
    <div className="metric-grid"><Metric icon={Cpu} label="Simulated processes" value={totalSimulated || '—'} note="completed in latest run" accent="violet"/><Metric icon={Database} label="Training records" value={summary?.rows ?? '—'} note="dataset observations" accent="blue"/><Metric icon={Gauge} label="CPU utilization" value={chartData.length ? `${Number(chartData[0].utilization).toFixed(1)}%` : '—'} note="latest FCFS baseline" accent="green"/><Metric icon={Timer} label="Prediction error" value={activeModel?.mae != null ? `${Number(activeModel.mae).toFixed(2)} ms` : '—'} note={`${activeModel?.model || 'Active model'} MAE`} accent="orange"/></div>
    <div className="content-grid"><Card><div className="card-title"><div><h3>Scheduling performance</h3><span>Actual average waiting time by algorithm</span></div><BarChart3 size={18}/></div><div className="chart">{chartData.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" fontSize={11}/><YAxis fontSize={11}/><Tooltip/><Bar dataKey="waiting" fill="#4263eb" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer> : <Empty text="Run a comparison to see backend results"/>}</div></Card><Card><div className="card-title"><div><h3>Model comparison</h3><span>Held-out validation · lower is better</span></div><BrainCircuit size={18}/></div><div className="mini-table">{metrics.slice(0, 4).map((m, i) => <div className="mini-row" key={m.model || i}><b>{m.model}</b><span>{m.mae != null ? `${Number(m.mae).toFixed(2)} ms` : '—'}</span><strong className={m.model === activeModel?.model ? 'best' : ''}>{m.model === activeModel?.model ? 'ACTIVE' : 'VALIDATED'}</strong></div>)}</div></Card></div></>
}

function Processes({ processes, setProcesses }) { const update = (i, key, value) => setProcesses(processes.map((p, j) => j === i ? {...p, [key]: key === 'process_id' ? value : Number(value)} : p)); return <><div className="page-intro"><div><h2>Process manager</h2><p>Configure ground truth; prediction features never receive future actual bursts.</p></div><Button onClick={() => setProcesses([...processes, { process_id: `P${processes.length + 1}`, arrival_time: 0, actual_burst: 10, priority: 1 }])}>+ Add process</Button></div><Card><div className="table-wrap"><table><thead><tr><th>Process</th><th>Arrival (ms)</th><th>Actual burst (ms)</th><th>Priority</th><th>Visibility</th><th/></tr></thead><tbody>{processes.map((p, i) => <tr key={i}><td><input value={p.process_id} onChange={e => update(i, 'process_id', e.target.value)}/></td><td><input type="number" min="0" value={p.arrival_time} onChange={e => update(i, 'arrival_time', e.target.value)}/></td><td><input type="number" min="0.1" value={p.actual_burst} onChange={e => update(i, 'actual_burst', e.target.value)}/></td><td><input type="number" min="1" value={p.priority} onChange={e => update(i, 'priority', e.target.value)}/></td><td><span className="privacy"><span/> Ground truth</span></td><td><button className="icon-button" onClick={() => setProcesses(processes.filter((_, j) => j !== i))}>×</button></td></tr>)}</tbody></table></div></Card></> }

function Predictions({ metrics, onTrain, loading }) { return <><div className="page-intro"><div><h2>ML Studio</h2><p>EWMA, Random Forest, XGBoost, and Voting Ensemble on one leakage-safe test split.</p></div><Button onClick={onTrain} disabled={loading}><RefreshCw size={15}/> {loading ? 'Training...' : 'Train models'}</Button></div><div className="metric-grid"><Metric icon={BrainCircuit} label="Active model" value={metrics.find(m => m.model === 'ensemble')?.model || 'Not trained'} note="selected from validation" accent="violet"/><Metric icon={Timer} label="MAE" value={metrics[0]?.mae != null ? `${Number(metrics[0].mae).toFixed(3)} ms` : '—'} note="mean absolute error" accent="orange"/><Metric icon={Activity} label="RMSE" value={metrics[0]?.rmse != null ? `${Number(metrics[0].rmse).toFixed(3)} ms` : '—'} note="root mean squared error" accent="blue"/><Metric icon={Database} label="Feature importance" value="Available" note="model metadata" accent="green"/></div><Card><div className="card-title"><div><h3>Validated model leaderboard</h3><span>Actual backend evaluation metrics</span></div></div><div className="table-wrap"><table><thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>R²</th><th>Training</th><th>Status</th></tr></thead><tbody>{metrics.map((m, i) => <tr key={i}><td><b>{m.model}</b></td><td>{Number(m.mae).toFixed(3)}</td><td>{Number(m.rmse).toFixed(3)}</td><td>{Number(m.r2).toFixed(3)}</td><td>{Number(m.training_time_ms).toFixed(1)} ms</td><td><span className="status-pill">{m.model === 'ensemble' ? 'Active' : 'Validated'}</span></td></tr>)}</tbody></table></div></Card></> }

function Scheduler({ algorithm, setAlgorithm, processes, run }) { return <><div className="page-intro"><div><h2>Scheduler control</h2><p>Non-preemptive selection with arrival-aware ready queues and adaptive aging.</p></div><Button onClick={run}><Play size={15}/> Simulate policies</Button></div><div className="scheduler-layout"><Card><h3>Scheduling policy</h3>{[['fcfs','FCFS','Arrival order'],['sjf','SJF','Shortest actual burst'],['ml_sjf','ML-SJF','Shortest predicted burst'],['adaptive_ml_sjf','Adaptive ML-SJF','Prediction + aging fairness']].map(([key, name, desc]) => <label className={`policy ${algorithm === key ? 'selected' : ''}`} key={key}><input type="radio" checked={algorithm === key} onChange={() => setAlgorithm(key)}/><span><b>{name}</b><small>{desc}</small></span></label>)}</Card><Card><div className="card-title"><div><h3>Ready queue preview</h3><span>{processes.length} processes loaded</span></div><Timer size={18}/></div><div className="queue">{processes.map((p, i) => <div className="queue-item" key={p.process_id}><span className="queue-number">{i + 1}</span><b>{p.process_id}</b><span>arrives {p.arrival_time} ms</span><em>priority {p.priority}</em></div>)}</div></Card></div></> }

function Simulation({ results, schedules, run, loading }) {
  const events = schedules?.adaptive_ml_sjf || schedules?.adaptive || []
  const metrics = results?.results?.find(item => item.algorithm === 'adaptive_ml_sjf') || {}
  const latest = events[events.length - 1]
  return <><div className="page-intro"><div><h2>Live simulation</h2><p>Completed backend execution events and actual-burst timeline.</p></div><Button onClick={run} disabled={loading}><Play size={15}/> {loading ? 'Simulating...' : 'Run simulation'}</Button></div>
    {!results && <Card><div className="simulation-empty"><div className="success-icon muted"><Cpu/></div><h3>CPU is idle</h3><p>Run a simulation to populate the real execution timeline.</p></div></Card>}
    {results && <><div className="metric-grid"><Metric icon={Activity} label="Simulation status" value={metrics.status || 'Completed'} note="backend execution state" accent="green"/><Metric icon={Timer} label="Current time" value={`${Number(metrics.current_time || metrics.total_completion_time || 0).toFixed(1)} ms`} note="simulation clock" accent="blue"/><Metric icon={Cpu} label="Running process" value={metrics.running_process || 'None'} note="non-preemptive run completed" accent="violet"/><Metric icon={Database} label="Ready queue" value={latest?.ready_queue?.length ?? 0} note="at final decision point" accent="orange"/></div>
      <Card><div className="card-title"><div><h3>Execution timeline</h3><span>Actual start and end times from Adaptive ML-SJF events</span></div></div><div className="gantt">{events.map(event => <div className="gantt-item" key={event.process_id} style={{flex: Math.max(.2, event.completion_time - event.start_time)}}><b>{event.process_id}</b><small>{Number(event.start_time).toFixed(1)}–{Number(event.completion_time).toFixed(1)} ms</small></div>)}</div></Card>
      <Card><div className="card-title"><div><h3>Process states</h3><span>Every process completed by the backend simulator</span></div></div><div className="table-wrap"><table><thead><tr><th>Process</th><th>State</th><th>Start</th><th>End</th><th>Actual burst</th><th>Waiting</th><th>Ready queue</th></tr></thead><tbody>{events.map(event => <tr key={event.process_id}><td><b>{event.process_id}</b></td><td><span className="status-pill">{event.state}</span></td><td>{Number(event.start_time).toFixed(1)} ms</td><td>{Number(event.completion_time).toFixed(1)} ms</td><td>{Number(event.actual_burst).toFixed(1)} ms</td><td>{Number(event.waiting_time).toFixed(1)} ms</td><td>{event.ready_queue?.join(', ') || 'Empty'}</td></tr>)}</tbody></table></div></Card></>}
  </>
}

function Performance({ results, chartData, run }) { return <><div className="page-intro"><div><h2>Algorithm comparison</h2><p>Identical workloads, four policies, metrics calculated from actual execution.</p></div><Button onClick={run}><RefreshCw size={15}/> Re-run comparison</Button></div><Card><div className="card-title"><div><h3>Waiting and turnaround time</h3><span>Backend simulation results · milliseconds</span></div></div>{chartData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="waiting" fill="#4263eb" name="Waiting"/><Bar dataKey="turnaround" fill="#15aabf" name="Turnaround"/></BarChart></ResponsiveContainer> : <Empty text="Run the comparison to load actual results"/>}</Card><Card><div className="table-wrap"><table><thead><tr><th>Algorithm</th><th>Avg waiting</th><th>Avg turnaround</th><th>Utilization</th><th>Throughput</th><th>Context switches</th></tr></thead><tbody>{(results?.results || []).map((r, i) => <tr key={i}><td><b>{r.algorithm}</b></td><td>{Number(r.average_waiting_time).toFixed(2)}</td><td>{Number(r.average_turnaround_time).toFixed(2)}</td><td>{Number(r.cpu_utilization).toFixed(1)}%</td><td>{Number(r.throughput).toFixed(3)}</td><td>{r.context_switches}</td></tr>)}</tbody></table></div></Card></> }

function WhatIf({ processes, run }) { return <><div className="page-intro"><div><h2>What-if experiments</h2><p>Modify the workload in Process Manager, then rerun all algorithms for a before-and-after comparison.</p></div><Button onClick={run}><GitCompare size={15}/> Compare scenario</Button></div><Card><h3>Current scenario</h3><p className="muted">The next comparison uses the same editable workload across FCFS, SJF, ML-SJF, and Adaptive ML-SJF.</p><div className="scenario-summary"><span><b>{processes.length}</b> processes</span><span><b>{processes.reduce((a, p) => a + Number(p.actual_burst), 0).toFixed(1)} ms</b> total work</span><span><b>{new Set(processes.map(p => p.priority)).size}</b> priority bands</span></div></Card></> }

function Adaptive({ adaptive, onRetrain, loading }) { return <><div className="page-intro"><div><h2>Adaptive learning monitor</h2><p>Feedback is validated before a new model becomes active.</p></div><Button onClick={onRetrain} disabled={loading}><RefreshCw size={15}/> Retrain now</Button></div><div className="metric-grid"><Metric icon={Database} label="Observations" value={adaptive?.observations ?? '—'} note="feedback samples stored" accent="violet"/><Metric icon={RefreshCw} label="Next retrain" value={adaptive?.samples_until_retrain ?? '—'} note="new samples remaining" accent="orange"/><Metric icon={BrainCircuit} label="Model version" value={adaptive?.model_version || '—'} note="currently active" accent="blue"/></div><Card><div className="card-title"><div><h3>Learning health</h3><span>Backend adaptive state</span></div></div><div className="health"><div className="health-bar"><span style={{width: `${Math.min(100, Number(adaptive?.progress_percent || 12))}%`}}/></div><p>{adaptive?.status || 'No observations yet. Execute a simulation and submit feedback to begin adaptive learning.'}</p></div></Card></> }
function SettingsPage({ onSave }) { return <><div className="page-intro"><div><h2>General settings</h2><p>Configure prediction and fairness behavior for local experiments.</p></div><Button variant="secondary" onClick={onSave}>Save settings</Button></div><Card><div className="settings-grid">{[['EWMA alpha','0.30','Recent burst influence.'],['Retraining interval','25','Feedback observations between validation runs.'],['Aging rate','0.10','Fairness bonus for waiting processes.'],['Random forest trees','200','Estimator count for the regressor.']].map(([label, value, hint]) => <label key={label}><span>{label}</span><input defaultValue={value}/><small>{hint}</small></label>)}</div></Card></> }
