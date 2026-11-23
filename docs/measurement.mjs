export class Measurement {
  constructor(start, previousSequence) {
    this.start = start;
    this.end = start + 3000;
    this.sequence = previousSequence;
    this.frames = [];
  }
  accept(frame) {
    if ((frame.startedAt ?? frame.time) <= this.start || frame.time >= this.end || frame.sequence <= this.sequence) return;
    this.sequence = frame.sequence;
    this.frames.push(frame);
  }
}