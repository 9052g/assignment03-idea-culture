const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
const film = document.createElement('canvas');
const filmCtx = film.getContext('2d');
const veins = document.createElement('canvas');
const veinCtx = veins.getContext('2d');
const editor = document.querySelector('#editor');
const input = document.querySelector('#idea');
const status = document.querySelector('#status');

let w = 0, h = 0, dpr = 1, nodes = [], fronts = [], occupied = new Map(), links = [];
let encounters = new Set(), running = true, pending = null, last = 0, frame = 0, simTime = 0, nextTrace = 1;
let collisionQueue = [], queuedPairs = new Set();
let nextBirthAt = 0;
let lastPlantAt = -Infinity;
let lastAutoShownAt = -Infinity, nextAutoDelay = 0;
let selectedIdea = null;
let language = 'zh';
const tr=(zh,en)=>language==='en'?en:zh;
const variations=['画面','日常错位','假设','隐喻','规则','视角反转','提问'];
const colors = ['#d5ecd1', '#c6e8d2', '#e0efd1', '#bddfc4', '#e1eacb'];

function size() {
  w = innerWidth; h = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  film.width = veins.width = Math.round(w * dpr);
  film.height = veins.height = Math.round(h * dpr);
  filmCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  veinCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  occupied.clear();
}

function updateStatus(message) {
  status.textContent = message || tr(`${nodes.filter(n => !n.child).length} 颗种子 · ${nodes.filter(n => n.child).length} 个新念头`,`${nodes.filter(n => !n.child).length} seeds · ${nodes.filter(n => n.child).length} new ideas`);
}

function updateGuide() {
  const seeds=nodes.filter(n=>!n.child).length;
  const ideas=nodes.filter(n=>n.child);
  let text;
  if(seeds===0) text=tr('点击画面空白处，输入一个词并点「种下」；然后点击附近的另一处空白，输入并种下第二个词。建议先种下 2—3 个词，观察它们生长。','Click the canvas and plant a word. Click another nearby spot to plant a second. Start with 2–3 words and watch them grow.');
  else if(seeds===1) text=tr('第一个词已经种下。请点击画面附近的另一处空白，输入并种下第二个词；两株菌丝相遇后会产生新想法。','Your first word is planted. Click another nearby spot and plant a second; their meeting can create a new idea.');
  else if(seeds===2) {
    text=tr('第二个词已经种下。再点击附近另一处空白，输入并种下第三个词；你也可以等待菌丝相遇，看看会长出什么。','Your second word is planted. Add a third nearby, or wait for the strands to meet.');
    if(ideas.some(n=>n.failed)) text+=tr(' 如果联想失败，可以点击「重试联想」。',' If generation fails, select Retry.');
    else if(ideas.some(n=>n.description)) text+=tr(' 点击新念头可以查看内容。',' Click a new idea to explore it.');
  }
  else if(ideas.some(n=>n.description)) text=tr('新想法已经长出。点击新词查看内容，也可以继续点击空白处种下其他词。','A new idea has grown. Click it to read more, or plant another word.');
  else if(ideas.some(n=>n.pending)) text=tr('菌丝相遇了，新想法正在生长。等一等，也可以继续点击空白处种词。','The strands have met and an idea is growing. Wait, or plant another word.');
  else if(ideas.some(n=>n.failed)) text=tr('这次没有生成出来。点击「重试联想」，也可以继续种下其他词。','The idea could not be generated. Select Retry, or plant another word.');
  else text=tr('已经种下几个词了。可以先观察菌丝相遇、产生新想法，也可以继续添加词。','Your words are planted. Watch them grow and meet, or add another.');
  if(seeds>=5) text+=tr(' 已经种下不少词，可以先等等，观察它们生长。',' You have planted several words; try watching them grow.');
  document.querySelector('#guide').textContent=text;
}

function addFronts(node, count = 5) {
  const others=nodes.filter(n=>n.id!==node.id);
  const nearest=others.reduce((best,n)=>!best||Math.hypot(n.x-node.x,n.y-node.y)<Math.hypot(best.x-node.x,best.y-node.y)?n:best,null);
  const base=nearest?Math.atan2(nearest.y-node.y,nearest.x-node.x):Math.random()*Math.PI*2;
  for (let i = 0; i < count; i++) {
    fronts.push({x:node.x, y:node.y, a:base+i*Math.PI*2/count+(Math.random()-.5)*.18,
      source:node.id, age:0, speed:.8+Math.random()*.35, depth:0, branches:0, trace:nextTrace++, lastJoin:-30});
  }
}

function guideNewSeed(node) {
  // Steer one additional strand toward a nearby, already visible strand.
  let target=null;
  for(const cell of occupied.values()) for(const point of cell) {
    const other=nodes[point.source];
    if(!other || other===node || other.failed) continue;
    const distance=Math.hypot(point.x-node.x,point.y-node.y);
    if(distance<35 || distance>150 || distance>growthRange(node,point.x,point.y,nextTrace)*.9 || !hasRoomForIdea(point.x,point.y,node,other)) continue;
    if(!target || distance<target.distance) target={...point,distance};
  }
  if(!target) return;
  fronts.push({x:node.x,y:node.y,a:Math.atan2(target.y-node.y,target.x-node.x),
    source:node.id,age:0,speed:1.15,depth:0,branches:0,trace:nextTrace++,lastJoin:-30,target});
}

function addNode(x, y, word, child = false, roots = null, waitForIdea = false) {
  const node = {id:nodes.length, x, y, word, child, roots:roots || [word], color:child?'#f0caa5':colors[nodes.length % colors.length], born:simTime, pending:waitForIdea};
  nodes.push(node);
  const el = document.createElement('div');
  el.className = 'spore' + (child ? ' child' : '');
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = '<div class="core"></div><label></label><small></small>';
  el.querySelector('label').textContent = word;
  if(child) el.querySelector('label').addEventListener('click',()=>{if(node.description) showIdea(node);else if(node.failed){node.autoAttempts=0;requestIdea(node);updateStatus(tr('正在重新联想…','Trying again…'));}});
  el.querySelector('small').textContent = child ? 'NEW IDEA' : 'SEED ' + String(nodes.filter(n => !n.child).length).padStart(2, '0');
  document.body.append(el); node.el = el;
  if (child) positionLabel(node);
  if (!waitForIdea) addFronts(node, child ? 3 : 5);
  updateStatus();
  updateGuide();
  return node;
}

function positionLabel(node) {
  const options = [[-55,-42],[55,-42],[-60,32],[60,32],[0,-70],[0,65]];
  let best = null;
  for (const [dx,dy] of options) {
    const lx = node.x + dx, ly = node.y + dy + 25;
    if (lx < 90 || lx > w-90 || ly < 145 || ly > h-95) continue;
    const score = Math.min(...nodes.filter(n=>n!==node).map(n=>Math.hypot((n.labelX??n.x)-lx,(n.labelY??n.y+25)-ly)));
    if (!best || score > best.score) best = {dx,dy,lx,ly,score};
  }
  if (!best) return;
  node.labelX = best.lx; node.labelY = best.ly;
  node.el.style.setProperty('--label-x', best.dx + 'px');
  node.el.style.setProperty('--label-y', best.dy + 'px');
}

function showIdea(node) {
  selectedIdea=node;
  document.querySelector('#idea-title').textContent=node.word;
  document.querySelector('#idea-description').textContent=node.description;
  document.querySelector('#idea-origin').textContent=tr(`来自：${node.inputs[0]} × ${node.inputs[1]}`,`From: ${node.inputs[0]} × ${node.inputs[1]}`);
  document.querySelector('#regenerate').disabled=node.pending;
  document.querySelector('#idea-card').hidden=false;
}

async function reserveIdeaDisplay(node) {
  while(nodes[node.id]===node){
    const now=performance.now();
    const wait=node.manualTriggered
      ? node.triggeredAt+1700-now
      : Math.max(lastPlantAt+1700-now,lastAutoShownAt+nextAutoDelay-now);
    if(wait<=0){
      if(!node.manualTriggered){lastAutoShownAt=performance.now();nextAutoDelay=8000+Math.random()*4000;}
      return true;
    }
    await new Promise(resolve=>setTimeout(resolve,Math.min(wait,500)));
  }
  return false;
}

function requestIdea(node) {
  if(node.description){node.previousWords=node.previousWords||[];node.previousWords.push(node.word);}
  node.revision=(node.revision||0)+1;
  node.variation=variations[(node.id+node.revision-1)%variations.length];
  node.pending = true; node.failed = false;
  node.el.querySelector('label').textContent = tr('等待联想…','Waiting…');
  updateGuide();
  if(selectedIdea===node){document.querySelector('#idea-description').textContent=tr('正在尝试另一种组合…','Trying another connection…');document.querySelector('#regenerate').disabled=true;}
  (async()=>{
    if (nodes[node.id]!==node) return;
    node.el.querySelector('label').textContent=tr('菌落生长中…','Colony growing…');
    const growing=nodes.filter(n=>n.pending).length;
    updateStatus(growing > 1 ? tr(`菌落生长中 · ${growing} 个新念头正在萌发`,`Colonies growing · ${growing} ideas emerging`) : tr('菌落生长中…','Colony growing…'));
    try {
      const existingNames=[...nodes.filter(n=>n!==node&&!n.pending&&!n.failed).map(n=>n.word),...(node.previousWords||[])].slice(-20);
      const response = await fetch('/api/idea', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({words:node.inputs,existingNames,variation:node.variation,language})});
      const data = await response.json();
      if (!response.ok || !data.name || !data.idea) throw new Error(language==='en' ? 'The local model did not respond. Check Ollama and retry.' : (data.error || '本地模型没有响应'));
      if (!await reserveIdeaDisplay(node) || nodes[node.id]!==node) return;
      node.word=data.name;node.description=data.idea;node.pending=false;node.autoAttempts=0;node.el.querySelector('label').textContent=data.name;
      positionLabel(node);
      updateGuide();
      if(!nodes.some(n=>n.failed))document.querySelector('#retry').hidden=true;
      showIdea(node);
      if(!node.hasGrowth){addFronts(node,3);node.hasGrowth=true;}
      updateStatus(`「${node.inputs[0]}」+「${node.inputs[1]}」→「${data.name}」`);
    } catch(error) {
      if (nodes[node.id]!==node) return;
      if((node.autoAttempts||0)<1){
        node.autoAttempts=(node.autoAttempts||0)+1;
        node.el.querySelector('label').textContent=tr('重新联想…','Trying again…');
        updateStatus(tr('这次没有生成完整想法，正在自动重试…','No complete idea yet; trying again…'));
        await new Promise(resolve=>setTimeout(resolve,2000));
        if(nodes[node.id]===node)requestIdea(node);
        return;
      }
      node.pending=false;
      if(node.description){node.failed=false;node.el.querySelector('label').textContent=node.word;if(selectedIdea===node)showIdea(node);}
      else{node.failed=true;node.el.querySelector('label').textContent=tr('点击重试','Click to retry');document.querySelector('#retry').hidden=false;}
      updateGuide();
      updateStatus(error.message || tr('暂时没生成出来，可以重试','Could not generate an idea; retry.'));
    } finally {
      if(nodes[node.id]===node) pumpCollisions();
    }
  })();
}

function distanceToNearestNode(x,y) {
  return nodes.reduce((closest,node)=>Math.min(closest,Math.hypot(node.x-x,node.y-y)),Infinity);
}

function hasRoomForIdea(x,y,a,b) {
  // Allow a genuine crossing near its two parents, while keeping other labels apart.
  return nodes.every(node=>Math.hypot(node.x-x,node.y-y)>=(node===a||node===b?24:45));
}

function meet(sourceA, sourceB, x, y) {
  if (sourceA === sourceB) return;
  const a = nodes[sourceA], b = nodes[sourceB];
  if (!a || !b || a.failed || b.failed) return;
  const key = [a.id,b.id].sort((x,y)=>x-y).join(':');
  if (encounters.has(key) || queuedPairs.has(key)) return;
  if (!hasRoomForIdea(x,y,a,b)) return;
  if (collisionQueue.length>=12) {
    const recentSeed=nodes.filter(n=>n.manualSeed && simTime-n.born<30000).at(-1);
    if(!recentSeed || (a!==recentSeed && b!==recentSeed)) return;
    const replace=collisionQueue.findIndex(item=>item.a!==recentSeed && item.b!==recentSeed);
    if(replace<0) return;
    queuedPairs.delete(collisionQueue[replace].key);
    collisionQueue.splice(replace,1);
  }
  queuedPairs.add(key);
  const recentSeed=nodes.filter(n=>n.manualSeed && simTime-n.born<30000).at(-1);
  const manualTriggered=!!(recentSeed && (a===recentSeed || b===recentSeed) && !recentSeed.priorityUsed);
  collisionQueue.push({a,b,x,y,key,manualTriggered,triggeredAt:manualTriggered?recentSeed.plantedAt:null});
  if(manualTriggered){
    recentSeed.priorityUsed=true;
    nextBirthAt=Math.min(nextBirthAt,Math.max(simTime+300,recentSeed.born+1000));
  }
  pumpCollisions();
}

function pumpCollisions() {
  while(running && performance.now()-lastPlantAt>=1000 && simTime>=nextBirthAt && collisionQueue.length && nodes.filter(n=>n.pending).length<3){
    // Keep intersections involving an unnamed colony until its idea arrives.
    collisionQueue=collisionQueue.filter(item=>{
      const valid=nodes[item.a.id]===item.a && nodes[item.b.id]===item.b && !item.a.failed && !item.b.failed && !encounters.has(item.key);
      if(!valid) queuedPairs.delete(item.key);
      return valid;
    });
    if(!collisionQueue.length) break;
    // Give a recently planted word a chance to connect before older colonies.
    collisionQueue.sort((a,b)=>{
      return Number(b.manualTriggered)-Number(a.manualTriggered) || distanceToNearestNode(b.x,b.y)-distanceToNearestNode(a.x,a.y);
    });
    const ready=collisionQueue.findIndex(item=>!item.a.pending && !item.b.pending);
    if(ready<0) break;
    const {a,b,x,y,key,manualTriggered,triggeredAt}=collisionQueue.splice(ready,1)[0];
    queuedPairs.delete(key);
    if(nodes[a.id]!==a || nodes[b.id]!==b || a.pending || b.pending || a.failed || b.failed || encounters.has(key) || !hasRoomForIdea(x,y,a,b)) continue;
    encounters.add(key);
    const roots=[...new Set([...a.roots,...b.roots])];
    const child=addNode(x,y,tr('等待联想…','Waiting…'),true,roots,true);
    const core=child.el.querySelector('.core');
    const revealCore=()=>{
      if(nodes[child.id]!==child) return;
      const wait=1700-(performance.now()-lastPlantAt);
      if(wait>0){core.style.visibility='hidden';setTimeout(revealCore,wait);}
      else core.style.visibility='';
    };
    revealCore();
    child.parents=[a.id,b.id];
    child.inputs=[a.word,b.word];
    child.manualTriggered=manualTriggered;child.triggeredAt=triggeredAt;
    // The new colony starts growing when its generated word is revealed.
    updateStatus(tr(`「${a.word}」和「${b.word}」相遇，菌落生长中…`,`${a.word} and ${b.word} met · colony growing…`));
    nextBirthAt=simTime+8000+Math.random()*4000;
    requestIdea(child);
  }
}

function sense(front) {
  const cx = Math.floor(front.x / 10), cy = Math.floor(front.y / 10);
  let connection=null;
  for (let dx=-2;dx<=2;dx++) for(let dy=-2;dy<=2;dy++) {
    for(const other of occupied.get(`${cx+dx},${cy+dy}`)||[]){
      if(other.source!==front.source||other.trace===front.trace)continue;
      const distance=Math.hypot(other.x-front.x,other.y-front.y);
      if(distance>7&&distance<25&&(!connection||distance<connection.distance))connection={...other,distance};
    }
  }
  if(connection && front.age-front.lastJoin>16 && Math.random()<.22){
    front.lastJoin=front.age;
    const dx=connection.x-front.x,dy=connection.y-front.y;
    veinCtx.strokeStyle=nodes[front.source].color;veinCtx.globalAlpha=.38;veinCtx.lineWidth=.6;
    veinCtx.beginPath();veinCtx.moveTo(front.x,front.y);
    veinCtx.quadraticCurveTo((front.x+connection.x)/2-dy*.22,(front.y+connection.y)/2+dx*.22,connection.x,connection.y);
    veinCtx.stroke();veinCtx.globalAlpha=1;
  }
  for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) {
    for(const other of occupied.get(`${cx+dx},${cy+dy}`)||[]) {
      if (front.age>12 && other.source!==front.source && Math.hypot(other.x-front.x,other.y-front.y)<8) {
        meet(front.source, other.source, (other.x+front.x)/2, (other.y+front.y)/2);
      }
    }
  }
  const cellKey=`${cx},${cy}`;
  const cell=occupied.get(cellKey)||[];
  const point={x:front.x,y:front.y,source:front.source,trace:front.trace};
  const existing=cell.findIndex(item=>item.source===front.source);
  if(existing>=0) cell[existing]=point;
  else if(cell.length<20) cell.push(point);
  occupied.set(cellKey,cell);
}

function growthRange(node,x,y,trace) {
  const direction=Math.atan2(y-node.y,x-node.x);
  const uneven=.92+.25*Math.sin(2*direction+node.id*1.9)+.18*Math.sin(3*direction-node.id*.8)+.12*Math.sin(5*direction+node.id)+.09*Math.sin(13*direction+node.id*2)+.06*Math.sin(23*direction-node.id)+.10*Math.sin(trace*2.37);
  return (node.child?118:175)*uneven;
}

function grow() {
  const next = [];
  for (const p of fronts) {
    if (p.age > (p.depth===0?320:180) || p.x<4 || p.y<4 || p.x>w-4 || p.y>h-4) continue;
    const source = nodes[p.source];
    if(source.child && performance.now()-lastPlantAt<1700){next.push(p);continue;}
    const range=growthRange(source,p.x,p.y,p.trace);
    const top=135+14*Math.sin(p.x*.035)+7*Math.sin(p.x*.1);
    const bottom=h-90+12*Math.sin(p.x*.028+1)+6*Math.sin(p.x*.085);
    if (Math.hypot(p.x-source.x,p.y-source.y)>range || p.y<top || p.y>bottom) continue;
    let nearest = null, dist = Infinity;
    for (const node of nodes) {
      if (node.id === p.source) continue;
      const d = Math.hypot(node.x-p.x,node.y-p.y);
      if (d<dist) {nearest=node;dist=d;}
    }
    p.a += (Math.random()-.5)*.09;
    if(p.target && nodes[p.target.source]){
      p.a=Math.atan2(p.target.y-p.y,p.target.x-p.x);
    } else if (nearest && dist<400 && p.depth===0) {
      const direction = Math.atan2(nearest.y-p.y,nearest.x-p.x);
      const turn = Math.atan2(Math.sin(direction-p.a),Math.cos(direction-p.a));
      p.a += Math.max(-.009,Math.min(.009,turn))*(dist<180?.8:.4);
    }
    const ox=p.x, oy=p.y;
    p.x += Math.cos(p.a)*p.speed; p.y += Math.sin(p.a)*p.speed; p.age++;
    const taper=Math.max(.55,1-p.age/(p.depth===0?500:300));
    const width=[1.9,1.2,.82,.58,.42][p.depth]*taper;
    veinCtx.strokeStyle=source.color; veinCtx.lineCap='round'; veinCtx.lineJoin='round';
    veinCtx.shadowColor=source.color; veinCtx.shadowBlur=3;
    veinCtx.beginPath(); veinCtx.moveTo(ox,oy); veinCtx.lineTo(p.x,p.y);
    veinCtx.globalAlpha=[.10,.095,.09,.085,.08][p.depth]; veinCtx.lineWidth=width+1.4; veinCtx.stroke();
    veinCtx.globalAlpha=[.55,.52,.49,.46,.43][p.depth]*(.9+.1*taper); veinCtx.lineWidth=width; veinCtx.stroke();
    veinCtx.globalAlpha=1; veinCtx.shadowBlur=0;
    sense(p);
    if(p.target && Math.hypot(p.target.x-p.x,p.target.y-p.y)<4){
      meet(p.source,p.target.source,(p.x+p.target.x)/2,(p.y+p.target.y)/2);
      p.target=null;
    }
    if (p.depth<4 && p.age>15 && p.age<160 && p.branches<4 && Math.random()<.03 && fronts.length+next.length<380) {
      p.branches++;
      next.push({...p,a:p.a+(Math.random()<.5?-1:1)*(.3+Math.random()*.45),age:0,depth:p.depth+1,branches:0,speed:p.speed*(.9+Math.random()*.1),trace:nextTrace++,lastJoin:-30,target:null});
    }
    next.push(p);
  }
  fronts = next;
}

function soften(context, amount) {
  context.globalCompositeOperation='destination-out';
  context.fillStyle=`rgba(0,0,0,${amount})`;context.fillRect(0,0,w,h);
  context.globalCompositeOperation='source-over';
}

function makeHyphae(node) {
  let seed=(node.id+1)*2654435761>>>0;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const hyphae=[];
  function branch(x,y,angle,length,depth){
    const points=[[x,y]];
    for(let j=1;j<=7;j++){
      angle+=(random()-.5)*.19;
      x+=Math.cos(angle)*length/7;y+=Math.sin(angle)*length/7;
      points.push([x,y]);
      if(depth<3 && (j===3||j===5) && random()>.22){
        const side=random()<.5?-1:1;
        branch(x,y,angle+side*(.55+random()*.26),length*(depth===0?.6:.52),depth+1);
      }
    }
    hyphae.push({points,depth});
  }
  const count=node.child?2:3;
  for(let i=0;i<count;i++)branch(0,0,i*Math.PI*2/count+random()*.32,(node.child?58:100)*( .84+random()*.3),0);
  return hyphae;
}

function drawColony(node,time){
  const progress=Math.min(1,(time-node.born)/(node.child?2500:3300));
  if(progress<=0)return;
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const strand of node.hyphae){
    const pts=strand.points;
    ctx.beginPath();ctx.moveTo(node.x+pts[0][0]*progress,node.y+pts[0][1]*progress);
    for(let i=1;i<pts.length-1;i++){
      const p=pts[i],q=pts[i+1];
      ctx.quadraticCurveTo(node.x+p[0]*progress,node.y+p[1]*progress,node.x+(p[0]+q[0])*progress/2,node.y+(p[1]+q[1])*progress/2);
    }
    const last=pts.at(-1);ctx.lineTo(node.x+last[0]*progress,node.y+last[1]*progress);
    ctx.strokeStyle=node.child?'#f0caa5':'#d5ecd1';
    ctx.globalAlpha=[.72,.55,.42,.3][strand.depth];
    ctx.lineWidth=[1.5,1.05,.72,.48][strand.depth];
    ctx.stroke();
  }
  ctx.globalAlpha=1;
}

function drawLink(link,time) {
  const elapsed=Math.min(1,(time-link.born)/1700);
  const {a,b,child}=link;
  for(const source of [a,b]){
    const dx=child.x-source.x,dy=child.y-source.y;
    const len=Math.max(1,Math.hypot(dx,dy));
    const bend=(source.id%2?1:-1)*Math.min(58,len*.34);
    const px=-dy/len,py=dx/len;
    const x1=source.x+dx*.27+px*bend,y1=source.y+dy*.27+py*bend;
    const x2=source.x+dx*.73-px*bend,y2=source.y+dy*.73-py*bend;
    ctx.beginPath();ctx.moveTo(source.x,source.y);
    for(let j=1;j<=32*elapsed;j++){
      const t=Math.min(elapsed,j/32),u=1-t;
      const x=u*u*u*source.x+3*u*u*t*x1+3*u*t*t*x2+t*t*t*child.x;
      const y=u*u*u*source.y+3*u*u*t*y1+3*u*t*t*y2+t*t*t*child.y;
      ctx.lineTo(x,y);
    }
    ctx.strokeStyle='#82968168';ctx.lineWidth=2.4;ctx.stroke();
    ctx.strokeStyle='#526e5aa0';ctx.lineWidth=.7;ctx.stroke();
  }
}

function render(time) {
  const dt = Math.min(42,time-last||16); last=time;
  if (running) {
    simTime += dt;
    pumpCollisions();
    grow();
    frame++;
  }
  ctx.fillStyle='#090d0b';ctx.fillRect(0,0,w,h);
  ctx.drawImage(veins,0,0,w,h);
  ctx.globalAlpha=1;
  requestAnimationFrame(render);
}

canvas.addEventListener('click', e=>{pending={x:e.clientX,y:e.clientY};input.value='';editor.showModal();input.focus();});
document.querySelector('#form').addEventListener('submit', e=>{
  if (e.submitter?.value==='cancel') return;
  const word=input.value.trim();if (!word || !pending){e.preventDefault();return;}
  lastPlantAt=performance.now();
  const planted=addNode(pending.x,pending.y,word);planted.manualSeed=true;planted.plantedAt=lastPlantAt;guideNewSeed(planted);pending=null;running=true;document.querySelector('#pause').textContent=tr('暂停生长','Pause');
  nextBirthAt=simTime+1000;
});
document.querySelector('#cancel').onclick=()=>{pending=null;editor.close();};
document.querySelector('#pause').onclick=e=>{running=!running;e.currentTarget.textContent=running?tr('暂停生长','Pause'):tr('继续生长','Resume');updateStatus(running?tr('正在生长','Growing'):tr('已暂停','Paused'));};
document.querySelector('#clear').onclick=()=>{
  nodes.forEach(n=>n.el.remove());nodes=[];fronts=[];links=[];collisionQueue=[];queuedPairs.clear();simTime=0;nextBirthAt=0;occupied.clear();encounters.clear();
  lastAutoShownAt=-Infinity;nextAutoDelay=0;lastPlantAt=-Infinity;
  document.querySelector('#retry').hidden=true;
  document.querySelector('#idea-card').hidden=true;
  selectedIdea=null;
  filmCtx.clearRect(0,0,w,h);veinCtx.clearRect(0,0,w,h);updateStatus(tr('等待第一颗孢子','Waiting for the first seed'));updateGuide();
};
document.querySelector('#retry').onclick=()=>{const failed=nodes.filter(n=>n.failed);document.querySelector('#retry').hidden=true;failed.forEach(node=>{node.autoAttempts=0;requestIdea(node)});if(failed.length)updateStatus(tr('正在重新联想…','Trying again…'));};
document.querySelector('#regenerate').onclick=()=>{if(selectedIdea&&!selectedIdea.pending){requestIdea(selectedIdea);updateStatus(tr('正在换一种方式联想…','Trying another connection…'));}};
document.querySelector('#example').onclick=()=>{
  document.querySelector('#clear').click();
  const cx=w/2,cy=h/2;
  addNode(cx-160,cy-65,tr('雨天','rain'));addNode(cx+160,cy-90,tr('便利店','corner shop'));addNode(cx+25,cy+155,tr('失眠','sleeplessness'));
  running=true;document.querySelector('#pause').textContent=tr('暂停生长','Pause');
};
document.querySelector('#language').onclick=()=>{
  language=language==='zh'?'en':'zh';
  document.documentElement.lang=language==='en'?'en':'zh-Hans';
  document.querySelector('#heading').textContent=tr('念头培养皿','Idea Culture');
  document.querySelector('#intro').textContent=tr('它们会生长，寻找别的词，并在相遇时繁衍出你意想不到的新念头。','Words grow, seek others, and give rise to unexpected ideas when they meet.');
  document.querySelector('#example').textContent=tr('种下示例','Plant examples');
  document.querySelector('#pause').textContent=running?tr('暂停生长','Pause'):tr('继续生长','Resume');
  document.querySelector('#clear').textContent=tr('清空培养皿','Clear dish');
  document.querySelector('#retry').textContent=tr('重试联想','Retry');
  document.querySelector('#regenerate').textContent=tr('换个想法','Another idea');
  document.querySelector('#editor-title').textContent=tr('种下一颗念头','Plant an idea');
  document.querySelector('#editor-help').textContent=tr('输入一个词或短句，然后点击「种下」。可以是日常事物，也可以是抽象概念，比如拓扑、量子或自由。','Enter a word or short phrase, then select Plant. Try everyday things or abstract concepts, such as topology, quantum or freedom.');
  input.placeholder=tr('例如：雨天、拓扑、量子…','e.g. rain, topology, quantum…');
  document.querySelector('#cancel').textContent=tr('取消','Cancel');
  document.querySelector('#plant').textContent=tr('种下','Plant');
  nodes.filter(n=>n.child&&(n.pending||n.failed)).forEach(n=>n.el.querySelector('label').textContent=n.pending?tr('菌落生长中…','Colony growing…'):tr('点击重试','Click to retry'));
  if(selectedIdea)showIdea(selectedIdea);
  updateGuide();updateStatus(nodes.length?null:tr('等待第一颗孢子','Waiting for the first seed'));
};
addEventListener('resize',size);size();requestAnimationFrame(render);
