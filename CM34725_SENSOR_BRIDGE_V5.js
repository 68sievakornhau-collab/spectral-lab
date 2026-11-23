(() => {
  'use strict';
  const TAG='SPECTRAL_LAB_CM34725_BRIDGE_V1';
  const SITE='https://kittipat-rot.github.io';
  if(location.origin!==SITE || !location.pathname.includes('ESP32-C3-supermini_TCS34725')){
    alert('กรุณารันบนหน้า CM-34725 ของ kittipat-rot.github.io เท่านั้น');return;
  }
  const target=window.opener;
  if(!target || target.closed){
    alert('เปิดหน้าเซนเซอร์จากปุ่ม Open CM-34725 Sensor ใน Spectral Lab รุ่น V3 ก่อน แล้วจึงรันโค้ด Bridge');return;
  }
  if(window.__spectralBridge?.stop)window.__spectralBridge.stop();
  let observer=null, timer=null, flushTimer=null, seq=0, lastKey=null, lastRawAt=0, ackSeq=0, nextStatus=0, awaitingAck=false;
  const bridgeSession=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
  const label=['R','G','B','C'];
  const badgeId='spectral-bridge-badge';
  let badge=document.getElementById(badgeId);
  if(!badge){badge=document.createElement('div');badge.id=badgeId;
    badge.style.cssText='position:fixed;z-index:2147483646;bottom:12px;left:12px;background:#22354b;color:#fff;border:1px solid #83b1ed;padding:10px 12px;border-radius:8px;font:12px/1.6 Segoe UI,Arial,sans-serif;max-width:450px;white-space:pre-wrap;';
    document.body.appendChild(badge);
  }
  const message=(kind,payload={})=>{try{target.postMessage({tag:TAG,kind,payload},'*');return true;}catch(_){return false;}};
  const show=t=>{if(badge)badge.textContent='SPECTRAL BRIDGE · '+t;};
  function linkCheck(){
    // Read the visible status strip before the CHANNELS panel. Some firmware
    // layouts insert separators or hidden DOM nodes; never assume 2,300 chars.
    const page=(document.body?.innerText||'').replace(/\u00a0/g,' ');
    const panelAt=page.search(/(?:02\s*)?CHANNELS\s*[·.\-:]?\s*RAW\s+COUNTS/i);
    const header=(panelAt>=0?page.slice(0,panelAt):page.slice(0,12000));
    const flat=header.replace(/\s+/g,' ').trim();
    const demo=/\bLINK\s*DEMO\b/i.test(flat);
    const ble=/\bLINK\s*BLE\b/i.test(flat);
    const device=/RGBMeter/i.test(flat);
    // Keep a short excerpt for honest diagnostics, never use status as sample data.
    const evidence=(flat.match(/LINK.{0,110}/i)||[])[0]||'(no LINK label)';
    return {ok:ble&&device&&!demo,ble,demo,device,evidence};
  }
  function sourceText(){
    const t=document.body?.innerText||'';
    const begin=/CHANNELS\s*[·.\-:]?\s*RAW\s+COUNTS/i.exec(t);
    if(!begin)return '';
    let segment=t.slice(begin.index+begin[0].length,begin.index+begin[0].length+3000);
    const stop=/\b(?:02B\s+PHOTOMETRY|PHOTOMETRY|CONTROLS)\b/i.exec(segment);
    if(stop)segment=segment.slice(0,stop.index);
    return segment;
  }
  function rawFromText(text){
    // Identify the four *channel rows*, never the derived sRGB preview.
    if(!text)return null;
    const lines=text.split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
    let positions=[];
    for(const ch of label){const i=lines.findIndex((x,j)=>(positions.length===0||j>positions.at(-1))&&x===ch);if(i<0)return null;positions.push(i);}
    const out={};
    for(let i=0;i<4;i++){
      const region=lines.slice(positions[i]+1,positions[i+1]??lines.length);
      // Prefer a line that consists only of a 0–65,535 integer, like '4,297'.
      const pure=region.filter(x=>/^(?:\d{1,3}(?:,\d{3})+|\d{1,5})$/.test(x)).map(x=>Number(x.replaceAll(',',''))).filter(v=>v<=65535);
      if(pure.length){out[label[i]]=pure.at(-1);continue;}
      // Some layouts put the channel number on the same line as its metadata.
      const tokens=[...region.join(' ').matchAll(/(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{1,5})(?![\d.,])/g)]
        .map(m=>Number(m[0].replaceAll(',',''))).filter(v=>v>=0&&v<=65535);
      if(!tokens.length)return null;out[label[i]]=tokens.at(-1);
    }
    return valid(out)?out:null;
  }
  function valid(o){return !!o&&label.every(k=>Number.isInteger(o[k])&&o[k]>=0&&o[k]<=65535);}
  function rawFromDOM(){
    const title=[...document.querySelectorAll('*')].find(el=>el.children.length===0&&/CHANNELS\s*[·.\-:]?\s*RAW\s+COUNTS/i.test(el.textContent||''));
    if(!title)return null;
    let region=title.parentElement;
    for(let k=0;region&&k<8;k++,region=region.parentElement){
      const leaves=[...region.querySelectorAll('*')].filter(el=>el.children.length===0);
      if(!label.every(ch=>leaves.some(el=>(el.textContent||'').trim()===ch)))continue;
      // Find the closest ancestor containing a channel's label and the count only;
      // never select percentage, lux, or the converted sRGB from other panels.
      const result={};
      for(const ch of label){
        const markers=leaves.filter(el=>(el.textContent||'').trim()===ch);
        for(const marker of markers){
          let row=marker.parentElement;
          for(let j=0;row&&j<6;j++,row=row.parentElement){
            const rowLeaves=[...row.querySelectorAll('*')].filter(el=>el.children.length===0);
            if(rowLeaves.some(el=>label.some(other=>other!==ch&&(el.textContent||'').trim()===other)))break;
            const numbers=rowLeaves.map((el,i)=>({
              text:(el.textContent||'').trim(),i,font:parseFloat(getComputedStyle(el).fontSize)||0
            })).filter(o=>/^(?:\d{1,3}(?:,\d{3})+|\d{1,5})$/.test(o.text))
              .map(o=>({...o,value:Number(o.text.replaceAll(',',''))}))
              .filter(o=>o.value>=0&&o.value<=65535);
            if(numbers.length){numbers.sort((a,b)=>b.font-a.font||b.i-a.i);
              result[ch]=numbers[0].value;break;}
          }
          if(Number.isInteger(result[ch]))break;
        }
      }
      if(valid(result))return result;
      const parsed=rawFromText(region.innerText||'');
      if(parsed)return parsed;
    }
    return null;
  }
  const parseRaw=()=>rawFromDOM()||rawFromText(sourceText());
  // A new displayed sample can have the same numeric counts as the previous sample.
  // Polling a static DOM is NOT evidence of a fresh sensor sample.
  let seenCountUpdates=0, sentCountUpdates=0;
  let lastEmittedAt=0;
  function findCountNodes(){
    const title=[...document.querySelectorAll('*')].find(el=>el.children.length===0&&/CHANNELS\s*[·.\-:]?\s*RAW\s+COUNTS/i.test(el.textContent||''));
    if(!title)return [];
    let scope=title.parentElement;
    for(let i=0;scope&&i<8;i++,scope=scope.parentElement){
      const leaves=[...scope.querySelectorAll('*')].filter(el=>el.children.length===0);
      if(!label.every(ch=>leaves.some(el=>(el.textContent||'').trim()===ch)))continue;
      const result=[];
      for(const ch of label){
        const markers=leaves.filter(el=>(el.textContent||'').trim()===ch);
        let found=null;
        for(const marker of markers){
          let row=marker.parentElement;
          for(let j=0;row&&j<6;j++,row=row.parentElement){
            const rowLeaves=[...row.querySelectorAll('*')].filter(el=>el.children.length===0);
            if(rowLeaves.some(el=>label.some(other=>other!==ch&&(el.textContent||'').trim()===other)))break;
            const numbers=rowLeaves.filter(el=>/^(?:\d{1,3}(?:,\d{3})+|\d{1,5})$/.test((el.textContent||'').trim()))
              .map(el=>({el,font:parseFloat(getComputedStyle(el).fontSize)||0}));
            if(numbers.length){numbers.sort((a,b)=>b.font-a.font);found=numbers[0].el;break;}
          }
          if(found)break;
        }
        if(!found)return [];
        result.push(found);
      }
      return result;
    }
    return [];
  }
  function countRowChanged(m){
    const target=m.target.nodeType===3?m.target.parentElement:m.target;
    if(!target||target===badge||badge?.contains(target))return false;
    const nodes=findCountNodes();
    // Restrict evidence to RAW COUNTS numeric readouts, not status, color, lux, or timers.
    return nodes.some(n=>n===target||n.contains(target)||n.parentElement===target);
  }
  function run(){
    const link=linkCheck();
    if(!link.ok){
      show(`ยังไม่ยืนยัน LINK BLE · ${link.evidence}`);
      if(Date.now()>nextStatus){message('status',{message:`ยังไม่ยืนยัน LINK BLE: ${link.evidence}`});nextStatus=Date.now()+3000;}return;
    }
    const raw=parseRaw();
    if(!raw){
      show('พบ LINK BLE แล้ว แต่ยังอ่าน CHANNELS · RAW COUNTS ไม่ได้');
      if(Date.now()>nextStatus){message('status',{message:'พบ LINK BLE แล้ว แต่ยังอ่านตัวเลข RAW COUNTS ไม่ได้'});nextStatus=Date.now()+3000;}return;
    }
    const key=label.map(k=>raw[k]).join(',');
    const initial=lastKey===null;
    const changed=!initial&&key!==lastKey;
    const panelUpdated=seenCountUpdates>sentCountUpdates;
    const fresh=changed||panelUpdated;
    const now=Date.now();
    // Debounce each sensor display update; prevent one multi-node redraw from
    // being counted as several independent observations.
    if((initial||fresh)&&(!awaitingAck)&&(initial||now-lastEmittedAt>=650)){
      lastKey=key;lastRawAt=now;lastEmittedAt=now;
      sentCountUpdates=seenCountUpdates;
      seq++;awaitingAck=true;
      message('raw',{...raw,sequence:seq,bridgeSession,fresh:!initial,
        evidence:initial?'initial-displayed-counts':(panelUpdated?'raw-count-dom-update':'raw-count-value-change'),
        capturedAt:new Date().toISOString(),source:'CM-34725 displayed RAW COUNTS',verifiedBLE:true});
    }
    const ack=ackSeq===seq&&seq>0;
    const rawLine=`R ${raw.R.toLocaleString()} · G ${raw.G.toLocaleString()} · B ${raw.B.toLocaleString()} · C ${raw.C.toLocaleString()}`;
    show(`${rawLine}\n${ack?'✓ หน้าบ้านตอบรับแล้ว':'รอหน้าบ้านตอบรับ'} · display update #${seq}`);
    if(Date.now()-lastRawAt>5000&&Date.now()>nextStatus){
      message('status',{message:'ไม่พบการอัปเดต RAW COUNTS ชุดใหม่กว่า 5 วินาที · ตรวจ STREAM'});nextStatus=Date.now()+4000;
    }
  }
  const receive=e=>{
    if(e.source!==target||e.data?.tag!==TAG||e.data.kind!=='ack')return;
    if(e.data.payload?.sequence===seq){ackSeq=seq;awaitingAck=false;run();}
  };
  window.addEventListener('message',receive);
  observer=new MutationObserver(records=>{
    if(!records.some(countRowChanged))return;
    seenCountUpdates++;
    // Wait for all four channel labels/readouts to settle on the same displayed update.
    if(flushTimer)clearTimeout(flushTimer);
    flushTimer=setTimeout(run,100);
  });
  const title=[...document.querySelectorAll('*')].find(el=>el.children.length===0&&/CHANNELS\s*[·.\-:]?\s*RAW\s+COUNTS/i.test(el.textContent||''));
  const scope=title?.parentElement?.parentElement?.parentElement||document.body;
  observer.observe(scope,{subtree:true,childList:true,characterData:true});
  // Polling detects changed displayed numbers, but NEVER emits an unchanged stale sample.
  timer=setInterval(run,250);
  window.__spectralBridge={stop(){clearInterval(timer);clearTimeout(flushTimer);observer.disconnect();window.removeEventListener('message',receive);message('status',{message:'Bridge หยุดแล้ว'});badge?.remove();}};
  message('ready',{message:'Bridge V5 ready · รอ RAW COUNTS ที่อัปเดตจาก BLE'});
  run();
})();