const suffix = '-b5a3-f393-e0a9-e50e24dcca9e';
const serviceId = '6e400001' + suffix;
const expected = {gain: 4, atime: 131, agc: 0, xled: 1, xpwr: 100, rate: 1000, stream: 1};
const commands = ['GAIN 4', 'ATIME 131', 'XPWR 100', 'XLED 1', 'RATE 1000', 'STREAM 1', 'STATE'];

export function parseLine(line) {
  const [type, ...fields] = line.split(',');
  if (type === 'S') {
    const values = Object.fromEntries(fields.flatMap(field => {
      const m = /^([a-z]+)=(-?\d+)$/.exec(field.trim());
      return m ? [[m[1], Number(m[2])]] : [];
    }));
    return {type, values};
  }
  if (type === 'E') return {type, message: fields.join(', ')};
  if (type !== 'D' || ![6, 7].includes(fields.length) ||
      fields.slice(0, 4).some(s => !/^\d+(?:\.\d+)?$/.test(s.trim())) ||
      fields.slice(4).some(s => !/^\d+$/.test(s.trim()))) return null;
  const [R, G, B, C, atime, gain, n = null] = fields.map(Number);
  if ([R, G, B, C].some(v => v < 0 || v > 65535) ||
      atime > 255 || ![1, 4, 16, 60].includes(gain) ||
      (n !== null && (!Number.isSafeInteger(n) || n < 1))) return null;
  return {type, R, G, B, C, atime, gain, n};
}

export function lineReader(onPacket) {
  const decoder = new TextDecoder();
  const maxLength = 1024;
  let pending = '', startedAt, discard = false;
  return (bytes, receivedAt = performance.now()) => {
    const lines = decoder.decode(bytes, {stream: true}).split('\n');
    for (const text of lines.slice(0, -1)) {
      const packet = !discard && pending.length + text.length <= maxLength
        ? parseLine((pending + text).trim()) : null;
      if (packet) onPacket(packet, receivedAt, startedAt ?? receivedAt);
      pending = '';
      startedAt = undefined;
      discard = false;
    }
    const tail = lines.at(-1);
    if (!discard && tail) {
      startedAt ??= receivedAt;
      pending += tail;
      if (pending.length > maxLength) { pending = ''; discard = true; }
    }
  };
}

export function configurationVerified(state) {
  return Object.entries(expected).every(([key, value]) => state[key] === value);
}

export class Sensor {
  constructor(events) { this.events = events; this.session = null; }
  async connect() {
    if (!navigator.bluetooth) throw Error('เปิดหน้าเว็บผ่าน HTTPS หรือ localhost ใน Chrome ที่รองรับ Web Bluetooth');
    const session = {sequence: 0, enabled: false, state: {}};
    this.session = session;
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{services: [serviceId]}, {namePrefix: 'RGBMeter'}], optionalServices: [serviceId]
      });
      if (this.session !== session) return;
      session.device = device;
      session.lost = () => this.disconnect(session, 'Bluetooth ขาดการเชื่อมต่อ');
      device.addEventListener('gattserverdisconnected', session.lost);
      const server = await device.gatt.connect();
      if (this.session !== session) { device.gatt.disconnect(); return; }
      this.events.status('waiting', device.name || 'BLE device');
      const service = await server.getPrimaryService(serviceId);
      const rx = await service.getCharacteristic('6e400002' + suffix);
      session.tx = await service.getCharacteristic('6e400003' + suffix);
      if (this.session !== session) return;
      const read = lineReader((packet, time, startedAt) => {
        if (this.session !== session) return;
        if (packet.type === 'D') {
          this.events.frame({...packet, sequence: ++session.sequence, time, startedAt});
        } else if (packet.type === 'S') {
          session.state = packet.values;
          this.events.settings(session.enabled && configurationVerified(session.state), session.state);
        } else {
          this.events.notice('อุปกรณ์รายงาน ' + packet.message);
        }
      });
      session.notify = event => read(event.target.value, event.timeStamp);
      session.tx.addEventListener('characteristicvaluechanged', session.notify);
      await session.tx.startNotifications();
      try {
        for (const cmd of commands) {
          if (this.session !== session) return;
          if (cmd === 'STATE') session.enabled = true;
          const bytes = new TextEncoder().encode(cmd + '\n');
          if (rx.properties.write && rx.writeValueWithResponse) await rx.writeValueWithResponse(bytes);
          else if (rx.properties.writeWithoutResponse && rx.writeValueWithoutResponse) await rx.writeValueWithoutResponse(bytes);
          else await rx.writeValue(bytes);
        }
      } catch (error) {
        if (this.session === session) {
          this.events.settings(false, session.state);
          this.events.notice('ส่งคำสั่งตั้งค่าไม่ครบ: ' + error.message);
        }
      }
    } catch (error) {
      if (this.session !== session) return;
      this.disconnect(session);
      throw error;
    }
  }
  disconnect(session = this.session, message = '') {
    if (!session || session !== this.session) return;
    this.session = null;
    session.tx?.removeEventListener('characteristicvaluechanged', session.notify);
    session.device?.removeEventListener('gattserverdisconnected', session.lost);
    if (session.device?.gatt.connected) session.device.gatt.disconnect();
    this.events.status('disconnected', '—');
    this.events.settings(false, {});
    this.events.notice(message);
  }
}