export function drawChart(canvas, result) {
  const width = canvas.clientWidth || 1000;
  const compact = width < 490;
  const height = Math.max(290, Math.round(width * .52));
  const scale = Math.max(2, 1000 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.dataset.renderWidth = String(width);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  const left = compact ? 62 : 82, top = 44, right = width - 23, bottom = height - 70;
  const curves = [['peak1', '#f98fae'], ['peak2', '#70c6ff'], ['total', '#d6f1ff']];
  if (result.hasBaseline) curves.push(['baseline', '#a7b0c3']);
  const values = result.curve.flatMap(point => curves.map(([key]) => point[key]));
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const x = wavelength => left + (wavelength - 350) * (right - left) / 450;
  const y = value => bottom - (value - lo) / span * (bottom - top);
  ctx.fillStyle = '#091b30';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e1edfa';
  ctx.font = compact ? 'bold 12px system-ui' : 'bold 16px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('RGB-Predicted Absorption Spectrum', width / 2, 24, width - 20);
  ctx.font = compact ? '11px system-ui' : '13px system-ui';
  for (let i = 0; i <= 5; i++) {
    const value = lo + i * span / 5;
    ctx.strokeStyle = '#2b4460';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(Number(value.toPrecision(4)), left - 10, y(value) + 5);
  }
  ctx.textAlign = 'center';
  const wavelengths = compact ? [350, 500, 650, 800] : [350, 400, 450, 500, 550, 600, 650, 700, 750, 800];
  for (const wavelength of wavelengths) ctx.fillText(wavelength, x(wavelength), bottom + 20);
  ctx.fillText('Wavelength (nm)', (left + right) / 2, bottom + 40);
  ctx.save();
  ctx.translate(19, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Predicted Absorbance', 0, 0);
  ctx.restore();
  for (const [key, color] of curves) {
    ctx.strokeStyle = color;
    ctx.lineWidth = key === 'total' ? 3 : 2;
    ctx.setLineDash(key === 'baseline' ? [8, 5] : []);
    ctx.beginPath();
    result.curve.forEach((point, i) => ctx[i ? 'lineTo' : 'moveTo'](x(point.wavelength), y(point[key])));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = compact ? '10px system-ui' : '12px system-ui';
  const names = {peak1:'Peak 1',peak2:'Peak 2',total:'Total spectrum',baseline:'Baseline'};
  curves.forEach(([key,color],i) => {
    ctx.fillStyle = color;
    const spacing = Math.min(130, (width - 12) / curves.length);
    ctx.fillText(names[key], width / 2 + (i - (curves.length - 1) / 2) * spacing, height - 10, spacing - 4);
  });
}

export function spectrumCsv(result) {
  const columns = [['Wavelength_nm','wavelength'], ['Gaussian_Peak_1','peak1'], ['Gaussian_Peak_2','peak2']];
  if (result.hasBaseline) columns.push(['Baseline','baseline']);
  columns.push(['Predicted_Absorbance','total']);
  return [columns.map(([heading]) => heading).join(','), ...result.curve.map(point =>
    columns.map(([,key]) => point[key]).join(','))].join('\r\n');
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}