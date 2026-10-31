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
let ideaQueue = Promise.resolve();
let collisionQueue = [], queuedPairs = new Set();
let nextBirthAt = 0;
let selectedIdea = null;
const variations=['视角反转','提问','矛盾','隐喻'];
const colors = ['#dbe992', '#b4de9d', '#c3d88c', '#a9d4a2', '#d0e39d'];

function size() {
  w = innerWidth; h = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  film.width = veins.width = w; film.height = veins.height = h;
  occupied.clear();
}

function updateStatus(message) {
  status.textContent = message || `${nodes.filter(n => !n.child).length} 颗种子 · ${nodes.filter(n => n.child).length} 个新念头`;
}

function updateGuide() {
  const seeds=nodes.filter(n=>!n.child).length;
  const ideas=nodes.filter(n=>n.child);
  let text;
  if(seeds===0) text='点击空白处，输入一个词并点「种下」；再在附近另一处种下第二个词。';
  else if(seeds===1) text='第一个词已经种下。再点击附近的空白处，输入第二个词；两株菌丝相遇后会产生新想法。';
  else if(ideas.some(n=>n.description)) text='新想法已经长出。点击新词查看内容，也可以继续点击空白处种下其他词。';
  else if(ideas.some(n=>n.pending)) text='菌丝相遇了，新想法正在生长。等一等，也可以继续点击空白处种词。';
  else if(ideas.some(n=>n.failed)) text='这次没有生成出来。点击「重试联想」，也可以继续种下其他词。';
  else text='至少两个词已经种下。等菌丝相遇，新想法会慢慢出现；也可以继续点击空白处添加词。';
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

function addNode(x, y, word, child = false, roots = null, waitForIdea = false) {
  const node = {id:nodes.length, x, y, word, child, roots:roots || [word], color:child?'#eac293':colors[nodes.length % colors.length], born:simTime, pending:waitForIdea};
  nodes.push(node);
  const el = document.createElement('div');
  el.className = 'spore' + (child ? ' child' : '');
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = '<div class="core"></div><label></label><small></small>';
  el.querySelector('label').textContent = word;
  if(child) el.querySelector('label').addEventListener('click',()=>{if(node.description) showIdea(node);else if(node.failed){node.autoAttempts=0;requestIdea(node);updateStatus('正在重新联想…');}});
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
  document.querySelector('#idea-origin').textContent=`来自：${node.inputs[0]} × ${node.inputs[1]} · ${node.variation||''}`;
  document.querySelector('#regenerate').disabled=node.pending;
  document.querySelector('#idea-card').hidden=false;
}

function requestIdea(node) {
  if(node.description){node.previousWords=node.previousWords||[];node.previousWords.push(node.word);}
  node.revision=(node.revision||0)+1;
  node.variation=variations[(node.id+node.revision-1)%variations.length];
  node.pending = true; node.failed = false;
  node.el.querySelector('label').textContent = '等待联想…';
  updateGuide();
  if(selectedIdea===node){document.querySelector('#idea-description').textContent='正在尝试另一种组合…';document.querySelector('#regenerate').disabled=true;}
  ideaQueue = ideaQueue.catch(()=>{}).then(async()=>{
    if (nodes[node.id]!==node) return;
    node.el.querySelector('label').textContent='菌落生长中…';
    const waiting=nodes.filter(n=>n.pending && n!==node).length+collisionQueue.length;
    updateStatus(waiting ? `菌落生长中 · ${waiting} 个想法等待中` : '菌落生长中…');
    try {
      const existingNames=[...nodes.filter(n=>n!==node&&!n.pending&&!n.failed).map(n=>n.word),...(node.previousWords||[])].slice(-20);
      const response = await fetch('/api/idea', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({words:node.inputs,existingNames,variation:node.variation})});
      const data = await response.json();
      if (!response.ok || !data.name || !data.idea) throw new Error(data.error || '本地模型没有响应');
      if (nodes[node.id]!==node) return;
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
        node.el.querySelector('label').textContent='重新联想…';
        updateStatus('这次没有生成完整想法，正在自动重试…');
        await new Promise(resolve=>setTimeout(resolve,2000));
        if(nodes[node.id]===node)requestIdea(node);
        return;
      }
      node.pending=false;
      if(node.description){node.failed=false;node.el.querySelector('label').textContent=node.word;if(selectedIdea===node)showIdea(node);}
      else{node.failed=true;node.el.querySelector('label').textContent='点击重试';document.querySelector('#retry').hidden=false;}
      updateGuide();
      updateStatus(error.message || '暂时没生成出来，可以重试');
    } finally {
      if(nodes[node.id]===node) pumpCollisions();
    }
  });
}

function distanceToNearestNode(x,y) {
  return nodes.reduce((closest,node)=>Math.min(closest,Math.hypot(node.x-x,node.y-y)),Infinity);
}

function hasRoomForIdea(x,y) {
  const minimum=Math.max(60,Math.min(120,Math.min(w,h)*.14));
  return distanceToNearestNode(x,y)>=minimum;
}

function meet(sourceA, sourceB, x, y) {
  if (sourceA === sourceB) return;
  const a = nodes[sourceA], b = nodes[sourceB];
  if (!a || !b || a.pending || b.pending || a.failed || b.failed) return;
  const key = [a.id,b.id].sort((x,y)=>x-y).join(':');
  if (encounters.has(key) || queuedPairs.has(key)) return;
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return;
  if (!hasRoomForIdea(x,y)) return;
  if (collisionQueue.length>=3) return;
  queuedPairs.add(key);
  collisionQueue.push({a,b,x,y,key});
  pumpCollisions();
}

function pumpCollisions() {
  while(running && simTime>=nextBirthAt && collisionQueue.length && nodes.filter(n=>n.pending).length<1){
    collisionQueue.sort((a,b)=>distanceToNearestNode(b.x,b.y)-distanceToNearestNode(a.x,a.y));
    const {a,b,x,y,key}=collisionQueue.shift();
    queuedPairs.delete(key);
    if(nodes[a.id]!==a || nodes[b.id]!==b || a.pending || b.pending || a.failed || b.failed || encounters.has(key) || !hasRoomForIdea(x,y)) continue;
    encounters.add(key);
    const roots=[...new Set([...a.roots,...b.roots])];
    const child=addNode(x,y,'等待联想…',true,roots,true);
    child.parents=[a.id,b.id];
    child.inputs=[a.word,b.word];
    addFronts(child,3);
    child.hasGrowth=true;
    updateStatus(`「${a.word}」和「${b.word}」相遇，菌落生长中…`);
    nextBirthAt=simTime+10000;
    requestIdea(child);
  }
}

function sense(front) {
  const cx = Math.floor(front.x / 10), cy = Math.floor(front.y / 10);
  let connection=null;
  for (let dx=-2;dx<=2;dx++) for(let dy=-2;dy<=2;dy++) {
    const other=occupied.get(`${cx+dx},${cy+dy}`);
    if(!other||other.source!==front.source||other.trace===front.trace)continue;
    const distance=Math.hypot(other.x-front.x,other.y-front.y);
    if(distance>7&&distance<25&&(!connection||distance<connection.distance))connection={...other,distance};
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
    const other = occupied.get(`${cx+dx},${cy+dy}`);
    if (front.age>12 && other && other.source!==front.source && Math.hypot(other.x-front.x,other.y-front.y)<8) {
      meet(front.source, other.source, (other.x+front.x)/2, (other.y+front.y)/2);
    }
  }
  occupied.set(`${cx},${cy}`, {x:front.x,y:front.y,source:front.source,trace:front.trace});
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
    if (nearest && dist<400 && p.depth===0) {
      const direction = Math.atan2(nearest.y-p.y,nearest.x-p.x);
      const turn = Math.atan2(Math.sin(direction-p.a),Math.cos(direction-p.a));
      p.a += Math.max(-.009,Math.min(.009,turn))*(dist<180?.8:.4);
    }
    const ox=p.x, oy=p.y;
    p.x += Math.cos(p.a)*p.speed; p.y += Math.sin(p.a)*p.speed; p.age++;
    veinCtx.strokeStyle=source.color; veinCtx.globalAlpha=[.77,.62,.48,.38,.28][p.depth];
    veinCtx.lineWidth=[2.5,1.45,.95,.62,.38][p.depth]; veinCtx.lineCap='round';
    veinCtx.beginPath(); veinCtx.moveTo(ox,oy); veinCtx.lineTo(p.x,p.y); veinCtx.stroke(); veinCtx.globalAlpha=1;
    sense(p);
    if (p.depth<4 && p.age>15 && p.age<160 && p.branches<4 && Math.random()<.03 && fronts.length+next.length<380) {
      p.branches++;
      next.push({...p,a:p.a+(Math.random()<.5?-1:1)*(.3+Math.random()*.45),age:0,depth:p.depth+1,branches:0,speed:p.speed*(.9+Math.random()*.1),trace:nextTrace++,lastJoin:-30});
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
    ctx.strokeStyle=node.child?'#f0c89c':'#dbe9a8';
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
    ctx.strokeStyle='#e5e9a568';ctx.lineWidth=2.4;ctx.stroke();
    ctx.strokeStyle='#f1efc6a0';ctx.lineWidth=.7;ctx.stroke();
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
  ctx.fillStyle='#101610';ctx.fillRect(0,0,w,h);
  ctx.drawImage(veins,0,0);
  ctx.globalAlpha=1;
  requestAnimationFrame(render);
}

canvas.addEventListener('click', e=>{pending={x:e.clientX,y:e.clientY};input.value='';editor.showModal();input.focus();});
document.querySelector('#form').addEventListener('submit', e=>{
  if (e.submitter?.value==='cancel') return;
  const word=input.value.trim();if (!word || !pending){e.preventDefault();return;}
  addNode(pending.x,pending.y,word);pending=null;running=true;document.querySelector('#pause').textContent='暂停生长';
});
document.querySelector('#cancel').onclick=()=>{pending=null;editor.close();};
document.querySelector('#pause').onclick=e=>{running=!running;e.currentTarget.textContent=running?'暂停生长':'继续生长';updateStatus(running?'正在生长':'已暂停');};
document.querySelector('#clear').onclick=()=>{
  nodes.forEach(n=>n.el.remove());nodes=[];fronts=[];links=[];collisionQueue=[];queuedPairs.clear();simTime=0;nextBirthAt=0;occupied.clear();encounters.clear();
  document.querySelector('#retry').hidden=true;
  document.querySelector('#idea-card').hidden=true;
  selectedIdea=null;
  filmCtx.clearRect(0,0,w,h);veinCtx.clearRect(0,0,w,h);updateStatus('等待第一颗孢子');updateGuide();
};
document.querySelector('#retry').onclick=()=>{const failed=nodes.filter(n=>n.failed);document.querySelector('#retry').hidden=true;failed.forEach(node=>{node.autoAttempts=0;requestIdea(node)});if(failed.length)updateStatus('正在重新联想…');};
document.querySelector('#regenerate').onclick=()=>{if(selectedIdea&&!selectedIdea.pending){requestIdea(selectedIdea);updateStatus('正在换一种方式联想…');}};
document.querySelector('#example').onclick=()=>{
  document.querySelector('#clear').click();
  const cx=w/2,cy=h/2;
  addNode(cx-160,cy-65,'雨天');addNode(cx+160,cy-90,'便利店');addNode(cx+25,cy+155,'失眠');
  running=true;document.querySelector('#pause').textContent='暂停生长';
};
addEventListener('resize',size);size();requestAnimationFrame(render);
