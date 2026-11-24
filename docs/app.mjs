import {Sensor, bluetoothRequestOptions} from './ble.mjs';
import {channels, snapshotsByDate, preview, reconstruct, summarize} from './science.mjs';
import {drawChart, download, spectrumCsv} from './chart.mjs';
import {Measurement} from './measurement.mjs';
import './motion.mjs';
import {showSensorPose, showAnalysisPose} from './scientist.mjs';

const $ = id => document.getElementById(id);
const set = (id, value) => { $(id).textContent = value; };
const labels = {disconnected:'Disconnected', waiting:'Connected — Waiting for Data', receiving:'Connected — Receiving Data'};
function bluetoothAvailabilityIssue() {
  if (!window.isSecureContext) return 'Web Bluetooth ต้องเปิดผ่าน HTTPS หรือ localhost (หน้านี้ไม่ใช่ Secure Context)';
  if (typeof navigator.bluetooth?.requestDevice !== 'function') {
    return 'เบราว์เซอร์นี้ไม่มี Web Bluetooth API · ใช้ Chrome รุ่นปัจจุบันบน Desktop หรือ Android และอนุญาต Bluetooth ให้เว็บไซต์';
  }
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (typeof policy?.allowsFeature === 'function' && !policy.allowsFeature('bluetooth')) {
    return 'Permissions Policy ของหน้านี้ไม่อนุญาต Bluetooth';
  }
  return '';
}
function bluetoothErrorDetail(error) {
  const name = error?.name || 'Error';
  const message = error?.message || String(error);
  return `${name}: ${message}`;
}
const bluetoothIssue = bluetoothAvailabilityIssue();
const format = v => v.toLocaleString('en-US', {maximumSignificantDigits: 8});
let snapshots = [], substanceCatalog = [], selectedSubstance = null, loadingModels = false, reading = 0, connecting = false, status = 'disconnected';
let last = null, previewFrames = [], current = null, result = null;
let connectionFailed = false;
const model = () => selectedSubstance?.model;
const receiving = () => status === 'receiving';
const clock = new Intl.DateTimeFormat('th-TH', {timeStyle:'medium'});
const modelNames = {linear:'Linear', quadratic:'Quadratic', exponential:'Exponential', logarithmic:'Logarithmic', power:'Power'};
const metricLabels = new Set(['Mean R ± SD','Mean G ± SD','Mean B ± SD','N','Maximum Absorption Wavelength (λmax)','Maximum Absorbance']);

const featureDimensions = {linear:3,quadratic:6,exponential:3,logarithmic:3,power:3};
const requiredGaussianParameters = ['H1','mu1','sigma1','H2','mu2','sigma2'];

function completeParameter(parameter) {
  if (parameter?.method === 'Mean') return Number.isFinite(parameter.mean);
  const model = parameter?.model;
  const size = featureDimensions[model?.type];
  return Number.isInteger(size) &&
    [model.coef,model.means,model.scales].every((values,i) =>
      Array.isArray(values) && values.length === size + (i === 0 ? 1 : 0) && values.every(Number.isFinite)) &&
    model.scales.every(value => value > 0);
}

function completeSubstance(substance) {
  if (!Array.isArray(substance?.rows) || !substance.rows.length ||
      substance.rows.some(row => !['R','G','B'].every(key => Number.isFinite(row?.[key])))) return false;
  const params = new Map((substance.params ?? []).map(parameter => [parameter.key,parameter]));
  return requiredGaussianParameters.every(key => completeParameter(params.get(key))) &&
    (!params.has('baseline') || completeParameter(params.get('baseline')));
}

function rawCountsCompatible(substance) {
  return substance?.rgbInputType === 'raw-counts' && completeSubstance(substance);
}

function substanceInputNotice(entry) {
  if (!entry) return 'เลือกชนิดสารจากฐานข้อมูลก่อนเริ่มวิเคราะห์';
  if (!entry.model || !entry.complete) return `ไม่พบ Regression และ Gaussian Parameters ที่ครบถ้วนสำหรับ ${entry.compound}`;
  if (entry.model.rgbInputType === 'display-rgb') {
    return `โมเดล ${entry.compound} ฝึกด้วย Display RGB (0–255) จึงใช้กับ Sensor Raw Counts ไม่ได้ ต้องใช้โมเดลที่ฝึกและบันทึกชนิดอินพุตเป็น raw-counts`;
  }
  if (typeof entry.model.rgbInputType === 'string') {
    return `โมเดล ${entry.compound} ระบุอินพุตเป็น ${entry.model.rgbInputType} ซึ่งไม่ตรงกับ Sensor Raw Counts`;
  }
  const values = ['R','G','B'].map(key => {
    const channel = entry.model.rows.map(row => row[key]);
    return `${key} ${format(Math.min(...channel))}–${format(Math.max(...channel))}`;
  }).join(', ');
  return `ชุดฝึก ${entry.compound} มีค่า ${values} และไม่มี metadata ยืนยันหน่วยหรือการแปลงเป็น Sensor Raw Counts จึงยังทำนายไม่ได้ ต้องใช้โมเดลที่ยืนยัน rgbInputType: "raw-counts"`;
}

function route() {
  const analysis = location.hash === '#analysis';
  if (analysis && !sessionStorage.getItem('spectral-visited')) {
    location.replace('#sensor');
    return;
  }
  $('sensor').hidden = analysis;
  $('analysis').hidden = !analysis;
  for (const [id, active] of [['connectionLink', !analysis], ['analysisLink', analysis]]) {
    if (active) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
}

function controls() {
  const searching = connecting && status === 'disconnected';
  const visualState = searching ? 'connecting' : connectionFailed && status === 'disconnected' ? 'error' : status;
  $('sensorCard').dataset.link = visualState;
  showSensorPose(visualState);
  $('connection').dataset.state = visualState;
  set('connection', searching ? 'Connecting…' : visualState === 'error' ? 'Connection Error' : labels[status]);
  set('simulate', current ? 'Collecting…' : 'Simulate Spectrum');
  document.body.toggleAttribute('data-collecting', !!current);
  $('connect').disabled = connecting || status !== 'disconnected' || !!bluetoothIssue;
  $('disconnect').disabled = status === 'disconnected';
  $('continue').disabled = connecting || !receiving();
  $('substance').disabled = !!current || loadingModels || !substanceCatalog.length;
  $('simulate').disabled = connecting || !!current || loadingModels || !receiving() || !model() || !selectedSubstance?.compatible;
  $('png').disabled = $('csv').disabled = !result || !!current;
}

function clearResult() {
  showAnalysisPose('idle');
  result = null;
  $('plot').classList.remove('reveal-spectrum');
  $('plot').hidden = $('legend').hidden = true;
  $('chartEmpty').hidden = false;
  summary([]);
}

function summary(rows) {
  let entry = 0;
  $('results').replaceChildren(...rows.map(([key, value]) => {
    const group = document.createElement('div');
    const term = document.createElement('dt'), detail = document.createElement('dd');
    group.className = metricLabels.has(key) ? 'metric' : 'metadata';
    if (group.className === 'metric') group.style.setProperty('--entry', entry++);
    term.textContent = key;
    detail.textContent = value;
    group.append(term, detail);
    return group;
  }));
}

function setStatus(state, name) {
  status = state;
  set('analysisStatus', labels[state]);
  $('analysisStatus').dataset.state = state;
  if (state !== 'disconnected') connectionFailed = false;
  if (name !== undefined) set('device', name);
  set('dataState', {disconnected:'รอการเชื่อมต่อ', waiting:'รอแพ็กเก็ต RGB', receiving:'กำลังรับ Raw RGB'}[state]);
  if (state !== 'receiving') {
    last = null;
    previewFrames = [];
    set('rawMeta', 'รอข้อมูลจากอุปกรณ์');
    for (const key of channels) {
      set('raw' + key, '—');
      $('level' + key).value = 0;
    }
    delete $('liveCard').dataset.packet;
    $('swatch').removeAttribute('data-live');
    set('displayRGB', 'Display RGB (0–255) · —');
    set('colorHex', '—');
    set('lastUpdated', '—');
    $('lastUpdated').removeAttribute('datetime');
    $('swatch').style.background = '';
    if (current) finish('การรับข้อมูลเซนเซอร์หยุดระหว่างวัด');
  }
  controls();
}

const sensor = new Sensor({
  status: setStatus,
  notice: message => set('sensorNotice', message),
  settings: (verified, state) => {
    const details = Number.isInteger(state.atime) ? ' · ' + state.gain + '× · ' +
      format((256 - state.atime) * 2.4) + ' ms · LED ' + (state.xled ? 'ON' : 'OFF') +
      ' ' + (state.xpwr ?? '—') + '% · ' + (state.rate ?? '—') + ' ms' : '';
    set('settings', (verified ? 'Verified by device' : 'Unverified') + details);
  },
  frame: frame => {
    last = frame;
    setStatus('receiving');
    for (const key of channels) {
      set('raw' + key, format(frame[key]));
      $('level' + key).value = frame[key];
    }
    $('liveCard').dataset.packet = frame.sequence % 2 ? 'odd' : 'even';
    $('swatch').setAttribute('data-live', '');
    set('rawMeta', 'Clear ' + format(frame.C) + ' · รอบวัดต่อแพ็กเก็ต ' + (frame.n ?? 'ไม่ระบุ'));
    if (previewFrames.at(-1)?.gain !== frame.gain || previewFrames.at(-1)?.atime !== frame.atime) previewFrames = [];
    previewFrames.push(frame);
    if (previewFrames.length > 8) previewFrames.shift();
    const average = Object.fromEntries(channels.map(key => [
      key, previewFrames.reduce((sum, f) => sum + f[key], 0) / previewFrames.length
    ]));
    const color = preview(average);
    $('swatch').style.background = 'rgb(' + color.join(',') + ')';
    set('displayRGB', 'Display RGB (0–255) · ' + color.join(' / ') + ' · N=' + previewFrames.length);
    set('colorHex', '#' + color.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase());
    const receivedAt = new Date(performance.timeOrigin + frame.time);
    set('lastUpdated', clock.format(receivedAt));
    $('lastUpdated').dateTime = receivedAt.toISOString();
    current?.measurement.accept(frame);
  }
});

if (bluetoothIssue) set('sensorNotice',bluetoothIssue);

function listSubstances() {
  const groups = new Map();
  for (const database of snapshots) for (const substance of database.substances) {
    const key = substance.compound.trim().toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key,{compound:substance.compound.trim(),candidates:[]});
    groups.get(key).candidates.push({snapshot:database,substance});
  }
  substanceCatalog = [...groups.values()].map(group => {
    const compatible = group.candidates.find(candidate => rawCountsCompatible(candidate.substance));
    const complete = group.candidates.find(candidate => completeSubstance(candidate.substance));
    const selected = compatible || complete || group.candidates[0];
    return {...group, snapshot:selected.snapshot, model:selected.substance,
      complete:completeSubstance(selected.substance), compatible:!!compatible};
  }).sort((a,b) => a.compound.localeCompare(b.compound,'en',{sensitivity:'base'}));
  $('substance').replaceChildren(new Option('Select a chemical…',''),
    ...substanceCatalog.map((entry,index) => new Option(entry.compound,String(index))));
  $('substance').value = '';
  selectSubstance();
}

function selectSubstance() {
  selectedSubstance = $('substance').value === '' ? null : substanceCatalog[Number($('substance').value)] ?? null;
  refreshSubstance();
}

function refreshSubstance() {
  const g = model();
  const types = new Set((g?.params ?? []).map(parameter =>
    modelNames[parameter.model?.type] || (parameter.method === 'Mean' ? 'Mean' : null)).filter(Boolean));
  set('modelTypes', [...types].join(' · ') || '—');
  set('databaseNote', selectedSubstance?.compatible
    ? `โหลดโมเดล Regression/Gaussian ล่าสุดที่ยืนยัน Sensor Raw Counts สำหรับ ${selectedSubstance.compound}`
    : substanceInputNotice(selectedSubstance));
  set('measurement', '');
  delete $('measurement').dataset.state;
  clearResult();
  controls();
}

async function loadDatabase(source) {
  const attempt = ++reading;
  loadingModels = true;
  set('modelTypes','กำลังโหลด…');
  set('databaseNote','กำลังค้นหาโมเดลสารที่สมบูรณ์และรองรับ Sensor Raw Counts…');
  controls();
  try {
    const data = snapshotsByDate(await source());
    if (attempt !== reading) return;
    snapshots = data;
    listSubstances();
    if (!substanceCatalog.length) set('databaseNote','ฐานข้อมูลไม่มีรายการสารเคมี');
  } catch (error) {
    if (attempt === reading) {
      snapshots = []; substanceCatalog = []; selectedSubstance = null;
      $('substance').replaceChildren();
      set('modelTypes','—');
      set('databaseNote','โหลดฐานข้อมูลจริงไม่ได้: ' + error.message);
    }
  } finally {
    if (attempt === reading) { loadingModels = false; controls(); }
  }
}

function finish(reason) {
  const capture = current;
  if (!capture) return;
  current = null;
  clearInterval(capture.timer);
  $('measurementProgress').hidden = true;
  try {
    if (reason) throw Error(reason);
    const frames = capture.measurement.frames;
    const first = frames[0];
    if (frames.some(f => f.gain !== first.gain || f.atime !== first.atime)) {
      throw Error('Gain หรือ Integration Time เปลี่ยนระหว่างวัด กรุณาวัดใหม่');
    }
    const {mean, sd, n} = summarize(frames);
    const rows = [['Selected Substance', capture.selection.compound], ['N', n],
      ...channels.map(key => ['Mean ' + key + ' ± SD', format(mean[key]) + ' ± ' + format(sd[key])])];
    summary(rows);
    if (!capture.selection.compatible) {
      throw Error(substanceInputNotice(capture.selection));
    }
    const predicted = reconstruct(capture.model, mean);
    $('plot').hidden = $('legend').hidden = false;
    drawChart($('plot'), predicted);
    $('plot').classList.add('reveal-spectrum');
    result = predicted;
    $('baselineLegend').hidden = !result.hasBaseline;
    $('chartEmpty').hidden = true;
    const gaussian = result.peaks.map((peak,index) => `Peak ${index + 1}: H ${format(peak.H)}, μ ${format(peak.mu)} nm, σ ${format(peak.sigma)} nm`);
    if (result.hasBaseline) gaussian.push('Baseline ' + format(result.baseline));
    summary([...rows,
      ['Gaussian Parameters', gaussian.join(' · ')],
      ['Maximum Absorption Wavelength (λmax)', format(result.maximum.wavelength) + ' nm'],
      ['Maximum Absorbance', format(result.maximum.total)]]);
    showAnalysisPose('completed');
    set('measurement', result.outside.length
      ? 'Extrapolation · RGB นอกช่วงฝึกในช่อง ' + result.outside.join(', ')
      : 'เก็บข้อมูลและคำนวณสเปกตรัมเสร็จแล้ว');
  } catch (error) {
    $('plot').hidden = $('legend').hidden = true;
    $('chartEmpty').hidden = false;
    $('measurement').dataset.state = 'error';
    showAnalysisPose('inspecting');
    set('measurement', error.message);
  }
  controls();
}

$('connect').addEventListener('click', () => {
  const issue = bluetoothAvailabilityIssue();
  if (issue) {
    connectionFailed = true;
    set('sensorNotice',issue);
    controls();
    return;
  }
  let deviceRequest;
  try {
    // Must execute synchronously during this click to preserve transient user activation.
    deviceRequest = navigator.bluetooth.requestDevice(bluetoothRequestOptions());
  } catch (error) {
    connectionFailed = error?.name !== 'NotFoundError';
    set('sensorNotice',bluetoothErrorDetail(error));
    controls();
    return;
  }
  connecting = true;
  connectionFailed = false;
  set('sensorNotice', '');
  controls();
  sensor.connect(deviceRequest).catch(error => {
    connectionFailed = error?.name !== 'NotFoundError';
    set('sensorNotice',bluetoothErrorDetail(error));
  }).finally(() => { connecting = false; controls(); });
});
$('disconnect').onclick = () => sensor.disconnect();
$('continue').onclick = () => {
  sessionStorage.setItem('spectral-visited', '1');
  $('analysisLink').hidden = false;
  location.hash = 'analysis';
};
$('simulate').onclick = () => {
  if ($('simulate').disabled) return;
  const measurement = new Measurement(performance.now(), last.sequence);
  clearResult();
  delete $('measurement').dataset.state;
  const progress = $('measurementProgress');
  progress.value = 0;
  progress.hidden = false;
  current = {model:model(), selection:selectedSubstance, measurement, timer:setInterval(() => {
    const left = measurement.end - performance.now();
    progress.value = progress.max - left;
    if (left <= 0) finish();
    else set('measurement', 'Collecting RGB Data · ' + (left / 1000).toFixed(1) + ' s · N=' + measurement.frames.length);
  }, 50)};
  showAnalysisPose('analyzing');
  set('measurement', 'Collecting RGB Data · 3.0 s');
  controls();
};
$('substance').onchange = selectSubstance;
$('png').onclick = () => $('plot').toBlob(blob => {
  if (blob) download(blob, 'spectral-lab.png');
}, 'image/png');
$('csv').onclick = () => {
  if (result) download(new Blob([spectrumCsv(result)], {type:'text/csv;charset=utf-8'}), 'spectral-lab.csv');
};
setInterval(() => {
  if (last && performance.now() - last.time > 3500) setStatus('waiting');
}, 250);
$('analysisLink').hidden = !sessionStorage.getItem('spectral-visited');
window.addEventListener('hashchange', () => {
  route();
  $(location.hash === '#analysis' && !$('analysis').hidden ? 'analysisTitle' : 'heroTitle').focus({preventScroll: true});
  window.scrollTo(0, 0);
});

const plot = $('plot');
new ResizeObserver(([entry]) => {
  const width = plot.clientWidth;
  if (result && entry.contentRect.width > 0 && plot.dataset.renderWidth !== String(width)) {
    drawChart(plot, result);
  }
}).observe(plot);
route();
loadDatabase(async () => {
  const response = await fetch('simulation-databases.json');
  if (!response.ok) throw Error('โหลดฐานข้อมูลจากเว็บไซต์ไม่ได้ กรุณานำเข้า JSON');
  return response.json();
});
