const keys = ['R', 'G', 'B'];
const dimensions = {linear: 3, quadratic: 6, exponential: 3, logarithmic: 3, power: 3};
const finite = Number.isFinite;
export const channels = keys;

export function snapshotsByDate(data) {
  const list = Array.isArray(data) ? data : data?.format === 'spectral-lab-simulation-db'
    ? (data.schemaVersion === 1 ? data.snapshots : null) : data?.simulationDatabases;
  if (!Array.isArray(list) || !list.length) throw Error('ไม่พบ Snapshots ที่รองรับใน JSON');
  const ids = new Set();
  for (const s of list) {
    if (typeof s?.id !== 'string' || !s.id || ids.has(s.id) ||
        typeof s.createdAt !== 'string' || !finite(Date.parse(s.createdAt)) ||
        !Array.isArray(s.substances) || !s.substances.length ||
        s.substances.some(g => typeof g?.compound !== 'string' || !g.compound.trim() ||
          !Array.isArray(g.params) || g.params.some(p => typeof p?.key !== 'string') ||
          new Set(g.params.map(p => p.key)).size !== g.params.length)) {
      throw Error('Snapshot มี ID ซ้ำ หรือข้อมูลวันที่ สาร หรือพารามิเตอร์ไม่ถูกต้อง');
    }
    ids.add(s.id);
  }
  return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function latestSnapshots(data) {
  return snapshotsByDate(data).slice(0,3);
}

export function summarize(frames) {
  const n = frames.length;
  if (n < 2) throw Error('ได้รับเฟรมใหม่ ' + n + ' เฟรม ต้องมีอย่างน้อย 2 เฟรมเพื่อคำนวณ Sample SD');
  const mean = {}, sd = {};
  for (const key of keys) {
    mean[key] = frames.reduce((sum, frame) => sum + frame[key], 0) / n;
    sd[key] = Math.sqrt(frames.reduce((sum, frame) => sum + (frame[key] - mean[key]) ** 2, 0) / (n - 1));
  }
  return {mean, sd, n};
}

export function preview(frame) {
  const max = Math.max(...keys.map(key => frame[key]));
  return keys.map(key => {
    const u = max ? frame[key] / max : 0;
    const corrected = u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055;
    return Math.round(corrected * 255);
  });
}

export function predict(parameter, rgb) {
  const m = parameter?.model;
  if (parameter?.method === 'Mean') return finite(parameter.mean) ? parameter.mean : NaN;
  if (!m || !Object.hasOwn(dimensions, m.type)) return NaN;
  const n = dimensions[m.type];
  if (![m.coef, m.means, m.scales].every((a, i) =>
    Array.isArray(a) && a.length === n + (i === 0 ? 1 : 0) && a.every(finite)) ||
    m.scales.some(s => s <= 0)) return NaN;
  const values = keys.map(key => rgb[key]);
  if (!values.every(finite)) return NaN;
  let features = values;
  if (m.type === 'quadratic') features = [...values, ...values.map(v => v * v)];
  if (m.type === 'logarithmic' || m.type === 'power') {
    if (values.some(v => v <= 0)) return NaN;
    features = values.map(Math.log);
  }
  const z = features.reduce((sum, x, i) => sum + m.coef[i + 1] * (x - m.means[i]) / m.scales[i], m.coef[0]);
  const y = m.type === 'exponential' || m.type === 'power' ? Math.exp(z) : z;
  return finite(y) ? y : NaN;
}

export function reconstruct(substance, rgb) {
  const params = new Map(substance.params.map(p => [p.key, p]));
  const peaks = [1, 2].map(i => {
    const [H, mu, sigma] = ['H', 'mu', 'sigma'].map(key => predict(params.get(key + i), rgb));
    if (![H, mu, sigma].every(finite) || H < 0 || sigma <= 0) {
      throw Error('Gaussian component ' + i + ' ไม่สมบูรณ์ ต้องมีสัมประสิทธิ์เต็ม และ H ≥ 0, σ > 0');
    }
    return {H, mu, sigma};
  }).sort((a, b) => a.mu - b.mu);
  const hasBaseline = params.has('baseline');
  const baseline = hasBaseline ? predict(params.get('baseline'), rgb) : 0;
  if (!finite(baseline)) throw Error('คำนวณ Baseline จากโมเดลไม่ได้');
  const point = wavelength => {
    const [peak1, peak2] = peaks.map(p => p.H * Math.exp(-0.5 * ((wavelength - p.mu) / p.sigma) ** 2));
    return {wavelength, peak1, peak2, baseline, total: baseline + peak1 + peak2};
  };
  const curve = Array.from({length: 451}, (_, i) => point(350 + i));
  if (curve.some(p => !finite(p.total))) throw Error('ค่า Absorbance เกินช่วงตัวเลขที่คำนวณได้');
  let maximum = curve.reduce((a, b) => a.total >= b.total ? a : b);
  for (let i = 1; i < 200000; i++) {
    const p = point(350 + i * 0.00225);
    if (p.total > maximum.total) maximum = p;
  }
  if (!finite(maximum.total)) throw Error('ค่า Absorbance สูงสุดเกินช่วงตัวเลขที่คำนวณได้');
  const rows = Array.isArray(substance.rows) ? substance.rows : [];
  const outside = keys.filter(key => {
    const values = rows.map(row => row?.[key]).filter(finite);
    return values.length && (values.every(v => rgb[key] < v) || values.every(v => rgb[key] > v));
  });
  return {peaks, baseline, hasBaseline, curve, maximum, outside};
}
