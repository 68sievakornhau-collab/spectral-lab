const guide = document.getElementById('virtualGuide');
if (guide) {
  const $ = id => document.getElementById(id);
  const steps = [
    {
      title:'เชื่อมต่อเซนเซอร์',
      description:'เริ่มจากเชื่อมต่อ ESP32-C3 ผ่าน Bluetooth แล้วตรวจสอบสถานะก่อนนำตัวอย่างไปวัด',
      status:'พร้อมเชื่อมต่อเซนเซอร์',caption:'STEP 01 · เตรียมการเชื่อมต่อ',pose:'inspecting',position:84,icon:'⌁'
    },
    {
      title:'เลือกฐานข้อมูล',
      description:'เลือก snapshot และสารเคมีที่ตรงกับตัวอย่าง เพื่อให้ระบบใช้แบบจำลองอ้างอิงที่เหมาะสม',
      status:'เลือก snapshot และสารอ้างอิง',caption:'STEP 02 · เลือกฐานข้อมูลอ้างอิง',pose:'selecting',position:240,icon:'▤'
    },
    {
      title:'วัดค่า Raw RGB',
      description:'วางตัวอย่างตรงตำแหน่งเซนเซอร์ ระบบจะรวบรวมค่าหลายครั้งและแสดงค่าเฉลี่ยก่อนวิเคราะห์',
      status:'กำลังอ่านตัวอย่างและหาค่าเฉลี่ย · ภาพสาธิต',caption:'STEP 03 · อ่านค่า RGB จากตัวอย่าง',pose:'measuring',position:386,icon:'◉'
    },
    {
      title:'วิเคราะห์ข้อมูล',
      description:'นำค่า RGB ไปเทียบกับ Regression ในฐานข้อมูล เพื่อประมาณพารามิเตอร์ของแบบจำลอง Gaussian',
      status:'จับคู่ RGB กับแบบจำลองอ้างอิง',caption:'STEP 04 · ประมาณพารามิเตอร์ Gaussian',pose:'analyzing',position:486,icon:'ƒ'
    },
    {
      title:'สร้างสเปกตรัม',
      description:'ระบบนำพารามิเตอร์ที่ประมาณได้มาสร้างเส้นสเปกตรัม เพื่อช่วยสำรวจผลการวิเคราะห์',
      status:'สาธิตการสร้างกราฟสเปกตรัม',caption:'STEP 05 · สร้างกราฟสเปกตรัม',pose:'presenting',position:486,icon:'∿'
    }
  ];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionIsReduced = () => reducedMotion.matches || document.body.classList.contains('motion-reduced');
  const stepButtons = [...guide.querySelectorAll('[data-guide-step]')];
  const readouts = [[$('guideR'),$('guideReadR')],[$('guideG'),$('guideReadG')],[$('guideB'),$('guideReadB')]];
  let index = 0, started = false, playing = false, completed = false;
  let timer = 0, sampleTimer = 0, poseTimer = 0, connectionTimer = 0, token = 0;
  const STEP_MS = 5600;

  function clearTimers() {
    clearTimeout(timer); clearInterval(sampleTimer); clearTimeout(poseTimer); clearTimeout(connectionTimer);
    timer = sampleTimer = poseTimer = connectionTimer = 0;
  }

  function setGuideReadout(values) {
    values.forEach((value, i) => readouts[i].forEach(node => { node.textContent = String(value); }));
  }

  function clearGuideReadout() {
    setGuideReadout(['—','—','—']);
    $('guideReadout').style.removeProperty('display');
    $('guideGaussian').style.removeProperty('display');
  }

  function refreshControls() {
    $('guideStart').textContent = completed ? 'Play Again' : started ? 'Restart Tutorial' : 'Start Tutorial';
    $('guidePause').textContent = playing ? 'Pause' : 'Resume';
    $('guidePause').disabled = !started || completed || motionIsReduced();
    $('guidePrevious').disabled = index === 0;
    $('guideNext').disabled = completed;
  }

  function setStep(nextIndex, {walk = true} = {}) {
    clearInterval(sampleTimer); sampleTimer = 0;
    clearTimeout(connectionTimer); connectionTimer = 0;
    index = Math.max(0, Math.min(steps.length - 1, nextIndex));
    const step = steps[index];
    completed = false;
    guide.dataset.step = String(index + 1);
    $('guideStage').dataset.step = String(index + 1);
    $('guideStageIndex').textContent = String(index + 1).padStart(2,'0') + ' / 05';
    $('guideStepNumber').textContent = 'STEP ' + String(index + 1).padStart(2,'0');
    $('guideStepTitle').textContent = step.title;
    $('guideStepDescription').textContent = step.description;
    $('guideStateText').textContent = motionIsReduced() ? 'ลดการเคลื่อนไหว · กด Next เพื่อเรียนรู้ทีละขั้น' : step.status;
    $('guideStateIcon').textContent = step.icon;
    $('guideStageCaption').textContent = step.caption;
    $('guideProgress').value = index + 1;
    $('guideProgressText').textContent = `${index + 1} / ${steps.length}`;
    $('guideComplete').hidden = true;
    stepButtons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    clearGuideReadout();
    $('guideReadout').style.display = index === 2 ? 'grid' : 'none';
    $('guideReadoutNote').style.display = index === 2 ? 'block' : 'none';
    $('guideGaussian').style.display = index === 3 ? 'block' : 'none';
    $('guideModelNote').style.display = index === 3 ? 'block' : 'none';
    const walker = $('guideWalker');
    const facingLeft = index === 4;
    walker.setAttribute('transform',`translate(${step.position} 145) scale(.78)`);
    $('guideWalker').querySelector('.guide-facing').style.transform = facingLeft ? 'scaleX(-1)' : '';
    guide.dataset.pose = walk && started && !motionIsReduced() ? 'walking' : step.pose;
    const currentToken = ++token;
    if (walk && started && !motionIsReduced()) {
      poseTimer = setTimeout(() => {
        if (currentToken === token) guide.dataset.pose = step.pose;
      }, 850);
    }
    $('guideArtDescription').textContent = `ขั้นตอน ${index + 1}: ${step.title} ห้องทดลองเสมือนแสดงการสาธิตประกอบคำอธิบาย`;
    refreshControls();
    if (index === 2) {
      setGuideReadout([118,164,201]);
      if (playing) startIllustrativeReadout();
    }
  }

  function startIllustrativeReadout() {
    clearInterval(sampleTimer);
    const samples = [[118,164,201],[124,159,207],[131,153,213],[127,157,210],[129,155,211]];
    let sample = 0;
    setGuideReadout(samples[sample]);
    sampleTimer = setInterval(() => {
      sample = (sample + 1) % samples.length;
      setGuideReadout(samples[sample]);
      if (sample === samples.length - 1) {
        $('guideStateText').textContent = 'เฉลี่ยค่าตัวอย่างแล้ว · ข้อมูลภาพสาธิต';
        clearInterval(sampleTimer);
        sampleTimer = 0;
      }
    },650);
  }

  function finishTutorial() {
    clearTimers();
    playing = false; completed = true; started = true;
    guide.dataset.playback = 'paused';
    $('guideStateText').textContent = 'เรียนรู้ครบทั้ง 5 ขั้นตอนแล้ว';
    $('guideStageCaption').textContent = 'ORIENTATION COMPLETE · พร้อมเริ่มทดลองจริง';
    $('guideComplete').hidden = false;
    $('guideProgress').value = steps.length;
    $('guideProgressText').textContent = `${steps.length} / ${steps.length}`;
    guide.dataset.pose = 'presenting';
    refreshControls();
  }

  function queueNext() {
    clearTimeout(timer);
    if (!playing || motionIsReduced()) return;
    timer = setTimeout(() => {
      if (index >= steps.length - 1) finishTutorial();
      else { setStep(index + 1); queueNext(); }
    },STEP_MS);
  }

  function scheduleConnectionCue() {
    clearTimeout(connectionTimer);
    if (!playing || motionIsReduced() || index !== 0) return;
    $('guideStateText').textContent = 'กำลังสาธิตการเชื่อมต่อ ESP32-C3';
    connectionTimer = setTimeout(() => {
      if (playing && index === 0) $('guideStateText').textContent = 'เชื่อมต่อสำเร็จ · สถานะภาพสาธิต';
    },1400);
  }

  function startTutorial() {
    clearTimers();
    started = true; completed = false;
    if (motionIsReduced()) {
      playing = false;
      guide.dataset.playback = 'paused';
      setStep(0,{walk:false});
      $('guideStateText').textContent = 'ลดการเคลื่อนไหว · กด Next เพื่อเรียนรู้ทีละขั้น';
    } else {
      playing = true;
      guide.dataset.playback = 'playing';
      setStep(0,{walk:true});
      scheduleConnectionCue();
      queueNext();
    }
    refreshControls();
  }

  function togglePlayback() {
    if (!started || completed || motionIsReduced()) return;
    if (playing) {
      playing = false; clearTimers();
      guide.dataset.playback = 'paused';
      $('guideStateText').textContent = 'หยุดชั่วคราว · กด Resume เพื่อเล่นต่อ';
    } else {
      playing = true;
      guide.dataset.playback = 'playing';
      $('guideStateText').textContent = steps[index].status;
      if (index === 2) startIllustrativeReadout();
      scheduleConnectionCue();
      queueNext();
    }
    refreshControls();
  }

  $('guideStart').addEventListener('click',startTutorial);
  $('guidePause').addEventListener('click',togglePlayback);
  $('guidePrevious').addEventListener('click',() => {
    if (index === 0) return;
    playing = false; clearTimers(); guide.dataset.playback = 'paused'; setStep(index - 1); refreshControls();
  });
  $('guideNext').addEventListener('click',() => {
    if (completed) return;
    clearTimeout(timer);
    if (index === steps.length - 1) finishTutorial();
    else { setStep(index + 1); if (playing) queueNext(); }
  });
  stepButtons.forEach((button, i) => button.addEventListener('click',() => {
    playing = false; clearTimers(); guide.dataset.playback = 'paused'; setStep(i); refreshControls();
  }));
  $('guideTry').addEventListener('click',() => {
    playing = false; clearTimers();
    if (!completed) guide.dataset.playback = 'paused';
    refreshControls();
    const sensorCard = $('sensorCard');
    sensorCard.scrollIntoView({behavior:motionIsReduced() ? 'auto' : 'smooth',block:'center'});
    setTimeout(() => $('connect').focus({preventScroll:true}),motionIsReduced() ? 0 : 500);
  });
  function syncMotionPreference() {
    if (motionIsReduced()) {
      playing = false; clearTimers();
      guide.dataset.playback = 'paused';
      $('guideStateText').textContent = 'ลดการเคลื่อนไหว · กด Next เพื่อเรียนรู้ทีละขั้น';
      guide.dataset.pose = steps[index].pose;
    } else if (started && !completed) {
      $('guideStateText').textContent = steps[index].status;
    }
    refreshControls();
  }
  reducedMotion.addEventListener('change',syncMotionPreference);
  $('reduceMotion').addEventListener('click',syncMotionPreference);
  document.addEventListener('visibilitychange',() => {
    if (document.hidden && playing) { playing = false; clearTimers(); guide.dataset.playback = 'paused'; refreshControls(); }
  });
  setGuideReadout(['—','—','—']);
  setStep(0,{walk:false});
}
