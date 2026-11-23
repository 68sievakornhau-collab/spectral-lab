import {Sensor} from './ble.mjs';
import {channels, latestSnapshots, preview, reconstruct, summarize} from './science.mjs';
import {drawChart, download, spectrumCsv} from './chart.mjs';
import {Measurement} from './measurement.mjs';
import './motion.mjs';
import {showSensorPose, showAnalysisPose} from './scientist.mjs';

const $ = id => document.getElementById(id);
const set = (id, value) => { $(id).textContent = value; };
const labels = {disconnected:'Disconnected', waiting:'Connected — Waiting for Data', receiving:'Connected — Receiving Data'};
const format = v => v.toLocaleString('en-US', {maximumSignificantDigits: 8});
let snapshots = [], importing = false, reading = 0, connecting = false, status = 'disconnected';
let last = null, previewFrames = [], current = null, result = null;
let connectionFailed = false;
const model = () => snapshots[$('database').value]?.substances[$('substance').value];
const snapshot = () => snapshots[$('database').value];
const receiving = () => status === 'receiving';
const clock = new Intl.DateTimeFormat('th-TH', {timeStyle:'medium'});
const modelNames = {linear:'Linear', quadratic:'Quadratic', exponential:'Exponential', logarithmic:'Logarithmic', power:'Power'};
const metricLabels = new Set(['Mean R ± SD','Mean G ± SD','Mean B ± SD','N','Predicted λmax','Predicted Maximum Absorbance']);

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
  $('connect').disabled = connecting || status !== 'disconnected';
  $('disconnect').disabled = status === 'disconnected';
  $('continue').disabled = connecting || !receiving();
  $('database').disabled = !!current || importing || !snapshots.length;
  $('substance').disabled = !!current || importing || !model();
  $('importDb').disabled = !!current;
  $('simulate').disabled = connecting || !!current || importing || !receiving() || !model();
  $('png').disabled = $('csv').disabled = !result || !!current;
}

function clearResult() {
  showAnalysisPose('idle');
  result = null;
  $('plot').classList.remove('reveal-spectrum');
  $('plot').hidden = $('legend').hidden = true;
  $('chartEmpty').hidden = false;
  summary([['สถานะ', 'รอการวัด']]);
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

function listSubstances() {
  $('substance').replaceChildren(...(snapshot()?.substances ?? []).map((g,i) => new Option(g.compound, i)));
  refreshSubstance();
}

function refreshSubstance() {
  const g = model();
  const types = new Set((g?.params ?? []).map(p => modelNames[p.model?.type] || (p.method === 'Mean' ? 'Mean' : null)).filter(Boolean));
  set('modelTypes', [...types].join(' · ') || '—');
  set('databaseNote', g?.rgbInputType === 'raw-counts'
    ? 'โมเดลระบุอินพุตเป็น Sensor Raw Counts'
    : g ? 'ชนิด RGB ของชุดฝึก: ' + (typeof g.rgbInputType === 'string' ? g.rgbInputType : 'ยังไม่ระบุ') +
      ' · เก็บและสรุป Raw Counts ได้ ผลทำนายต้องรอการยืนยันชนิดอินพุต' : 'ยังไม่มีฐานข้อมูล');
  set('measurement', '');
  delete $('measurement').dataset.state;
  clearResult();
  controls();
}

async function loadDatabase(source) {
  const attempt = ++reading;
  importing = true;
  controls();
  try {
    const data = latestSnapshots(await source());
    if (attempt !== reading) return;
    snapshots = data;
    const date = new Intl.DateTimeFormat('th-TH', {dateStyle:'medium',timeStyle:'medium'});
    $('database').replaceChildren(...data.map((s,i) => new Option(
      (s.label || s.id) + ' · ' + date.format(new Date(s.createdAt)), i)));
    listSubstances();
  } catch (error) {
    if (attempt === reading) {
      set('databaseNote', snapshots.length
        ? 'นำเข้าไม่สำเร็จ ยังใช้ฐานข้อมูลที่เลือกไว้ · ' + error.message
        : error.message);
    }
  } finally {
    if (attempt === reading) { importing = false; controls(); }
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
    const rows = [['Selected Database', capture.snapshot.label || capture.snapshot.id],
      ['Selected Substance', capture.model.compound], ['N', n],
      ...channels.map(key => ['Mean ' + key + ' ± SD', format(mean[key]) + ' ± ' + format(sd[key])])];
    summary(rows);
    if (capture.model.rgbInputType !== 'raw-counts') {
      throw Error('หยุดก่อนทำนาย ต้องยืนยันว่าโมเดลฝึกด้วย Sensor Raw Counts');
    }
    const predicted = reconstruct(capture.model, mean);
    $('plot').hidden = $('legend').hidden = false;
    drawChart($('plot'), predicted);
    $('plot').classList.add('reveal-spectrum');
    result = predicted;
    $('baselineLegend').hidden = !result.hasBaseline;
    $('chartEmpty').hidden = true;
    summary([...rows, ...result.peaks.map((p,i) => ['Gaussian Peak ' + (i+1),
      'H ' + format(p.H) + ' · μ ' + format(p.mu) + ' nm · σ ' + format(p.sigma) + ' nm']),
      ...(result.hasBaseline ? [['Baseline', format(result.baseline)]] : []),
      ['Predicted λmax', format(result.maximum.wavelength) + ' nm'],
      ['Predicted Maximum Absorbance', format(result.maximum.total)]]);
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

$('connect').onclick = async () => {
  connecting = true;
  connectionFailed = false;
  set('sensorNotice', '');
  controls();
  try { await sensor.connect(); }
  catch (error) {
    connectionFailed = error.name !== 'NotFoundError';
    set('sensorNotice', connectionFailed ? error.message : 'ยกเลิกการเลือกอุปกรณ์');
  }
  finally { connecting = false; controls(); }
};
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
  current = {model:model(), snapshot:snapshot(), measurement, timer:setInterval(() => {
    const left = measurement.end - performance.now();
    progress.value = progress.max - left;
    if (left <= 0) finish();
    else set('measurement', 'Collecting RGB Data · ' + (left / 1000).toFixed(1) + ' s · N=' + measurement.frames.length);
  }, 50)};
  showAnalysisPose('analyzing');
  set('measurement', 'Collecting RGB Data · 3.0 s');
  controls();
};
$('database').onchange = listSubstances;
$('substance').onchange = refreshSubstance;
$('importDb').onchange = async () => {
  const file = $('importDb').files[0];
  if (file) await loadDatabase(async () => JSON.parse(await file.text()));
  $('importDb').value = '';
};
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