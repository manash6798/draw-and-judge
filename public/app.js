const socket=io({transports:['websocket','polling'],upgrade:true,reconnection:true,reconnectionAttempts:8,reconnectionDelay:800,reconnectionDelayMax:5000,timeout:10000});
const $=id=>document.getElementById(id);
const screens=[...document.querySelectorAll('.screen')];
let room=null,lastStatus=null,timer=null,createMode=true,roundsDraft=[],lastCanvasRound=-1,lastSubmittedRound=-1;
let votingDrawings={};
let pendingStrokes=[],strokeFlushTimer=null;
let selected={best:null,worst:null,funniest:null};
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let drawing=false,tool='pen',color='#151923',shapeStart=null,shapeBase=null,previewPoint=null,previewRAF=0;
let drawHistory=[],drawRedo=[],activeDrawGroup=null;
let audioCtx=null;
function sound(type='click'){
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const now=audioCtx.currentTime, o=audioCtx.createOscillator(), g=audioCtx.createGain();
    const presets={click:[520,.045,.035,'square'],join:[660,.08,.045,'sine'],start:[330,.08,.05,'triangle'],correct:[660,.09,.07,'sine'],vote:[440,.07,.045,'triangle'],error:[150,.16,.045,'sawtooth'],pop:[780,.055,.03,'triangle']};
    const [freq,dur,vol,wave]=presets[type]||presets.click;
    o.type=wave;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*(type==='correct'?1.55:.82),now+dur);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);
    o.connect(g).connect(audioCtx.destination);o.start(now);o.stop(now+dur+.02);
    if(type==='correct'||type==='start'){setTimeout(()=>sound('pop'),70)}
  }catch{}
}
function confetti(count=18){
  const layer=document.createElement('div');layer.className='confetti-layer';
  for(let i=0;i<count;i++){const x=document.createElement('i');x.style.left=(10+Math.random()*80)+'%';x.style.setProperty('--dx',((Math.random()-.5)*180)+'px');x.style.setProperty('--delay',(Math.random()*.12)+'s');x.style.setProperty('--rot',(Math.random()*720-360)+'deg');x.textContent=['●','◆','★','▲'][i%4];layer.appendChild(x)}
  document.body.appendChild(layer);setTimeout(()=>layer.remove(),1300);
}
function roundFX(){sound('start');document.body.classList.remove('round-pop');void document.body.offsetWidth;document.body.classList.add('round-pop');setTimeout(()=>document.body.classList.remove('round-pop'),500)}
const adjectives=['Pixel','Cosmic','Tiny','Sleepy','Turbo','Mystic','Sneaky','Crispy','Wobbly','Golden'];
const nouns=['Bean','Fox','Potato','Goose','Wizard','Toast','Noodle','Penguin','Goblin','Mango'];
function randomName(){return adjectives[Math.floor(Math.random()*adjectives.length)]+nouns[Math.floor(Math.random()*nouns.length)]+Math.floor(Math.random()*90+10)}
function show(id){screens.forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo(0,0)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isHost(){return room&&room.hostId===socket.id}
function isDrawer(){return room&&room.status==='drawing'&&room.drawerId===socket.id}
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),2200)}
function systemMessage(text,cls='system'){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;$('messages').appendChild(d);$('messages').scrollTop=$('messages').scrollHeight}

socket.on('connect',()=>{$('online').textContent='O';$('online').className='status-dot online';$('online').title='Online';const b=$('continueBtn');if(b&&!b.disabled)b.textContent=createMode?'Create room':'Join room'});
socket.on('reconnect_attempt',()=>{$('online').textContent='C';$('online').className='status-dot connecting';$('online').title='Connecting'});
socket.on('disconnect',()=>{$('online').textContent='C';$('online').className='status-dot reconnecting';$('online').title='Connecting';const b=$('continueBtn');if(b&&b.disabled){b.disabled=false;b.textContent=createMode?'Create room':'Join room'}});
socket.on('connect_error',()=>{$('online').textContent='F';$('online').className='status-dot offline';$('online').title='Offline / server unavailable'});
socket.io.on('reconnect_attempt',()=>{$('online').textContent='C';$('online').className='status-dot connecting';$('online').title='Connecting'});
socket.io.on('reconnect_failed',()=>{$('online').textContent='F';$('online').className='status-dot offline';$('online').title='Offline / server unavailable'});
socket.on('round:started',m=>{if(m.drawerId===socket.id) sound('start'); else sound('pop');roundFX()});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled&&!b.closest('.canvas-wrap'))sound('click')});
$('createBtn').onclick=()=>openSetup(true);$('joinBtn').onclick=()=>openSetup(false);$('backSetup').onclick=()=>show('home');$('randomName').onclick=()=>{$('nameInput').value=randomName()};
function openSetup(create){createMode=create;$('setupTitle').textContent=create?'Create an event':'Join an event';$('continueBtn').textContent=create?'Create room':'Join room';$('codeBox').classList.toggle('hidden',create);$('nameInput').value=localStorage.getItem('dj_name')||randomName();$('setupError').textContent='';show('setup')}
$('continueBtn').onclick=()=>{
  $('setupError').textContent='';
  if(!socket.connected){$('setupError').textContent='Server is offline. Wait for C to change to O, then try again.';sound('error');return}
  const name=$('nameInput').value.trim();
  if(!name)return $('setupError').textContent='Choose an anonymous nickname.';
  if(!createMode&&$('codeInput').value.trim().length<5)return $('setupError').textContent='Enter the 5-character room code.';
  localStorage.setItem('dj_name',name);
  const event=createMode?'room:create':'room:join';
  const payload=createMode?{name}:{name,code:$('codeInput').value.trim()};
  $('continueBtn').disabled=true; $('continueBtn').textContent=createMode?'Creating room…':'Joining room…';
  let answered=false;
  const failTimer=setTimeout(()=>{if(answered)return;answered=true;$('continueBtn').disabled=false;$('continueBtn').textContent=createMode?'Create room':'Join room';$('setupError').textContent='The server did not respond. If Render just restarted, wait a few seconds and try again.';sound('error')},9000);
  try{
    socket.timeout(8500).emit(event,payload,(err,res)=>{
      if(answered)return; answered=true; clearTimeout(failTimer);
      $('continueBtn').disabled=false; $('continueBtn').textContent=createMode?'Create room':'Join room';
      if(err){$('setupError').textContent='Connection timed out. Check Render, then try again.';sound('error');return}
      if(!res?.ok){$('setupError').textContent=res?.error||'Could not connect to the room.';sound('error');return}
      sound('join');
      setTimeout(()=>socket.emit('chat:history'),80);
    });
  }catch(err){
    clearTimeout(failTimer);$('continueBtn').disabled=false;$('continueBtn').textContent=createMode?'Create room':'Join room';$('setupError').textContent='Could not contact the game server. Try again.';sound('error');
  }
};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);$('copyCode').textContent='Copied ✓';setTimeout(()=>$('copyCode').textContent='Copy',1300)}catch{toast('Room code: '+room.code)}};$('gameCopyCode').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);$('gameCopyCode').textContent='Copied ✓';setTimeout(()=>$('gameCopyCode').textContent='Copy',1300)}catch{toast('Room code: '+room.code)}};

$('startEvent').onclick=()=>{if(!socket.connected)return toast('Not connected — wait for O status.');$('startEvent').disabled=true;$('startEvent').textContent='Starting…';socket.timeout(8500).emit('host:start',{rounds:roundsDraft},(err,res)=>{if(err||res?.ok===false){$('startEvent').disabled=false;$('startEvent').textContent='Start game →';toast(err?'Server did not respond. Try again.':(res?.error||'Could not start game.'));sound('error')}})};

function playerHTML(u,moderation=false){const controls=moderation&&isHost()&&u.id!==socket.id&&u.connected?`<span class="player-actions"><button class="kick" data-action="kick" data-id="${u.id}">Kick</button><button class="ban" data-action="ban" data-id="${u.id}">Ban</button></span>`:'';const drawer=u.id===room.drawerId&&room.status==='drawing';const guessed=room.guessedIds?.includes(u.id);return `<div class="player ${drawer?'is-drawer':''} ${guessed?'is-guessed':''}"><div class="avatar">${esc(u.avatar)}</div><span class="pname">${esc(u.name)}${drawer?'<small class="drawer-label">DRAWING</small>':''}</span><span class="score-pill">${u.score||0}</span>${u.id===room.hostId?'<span class="host-tag">HOST</span>':''}${guessed?'<span class="guess-check">✓</span>':''}${controls}</div>`}
function bindModeration(){document.querySelectorAll('.player-actions button').forEach(btn=>btn.onclick=()=>{const action=btn.dataset.action,id=btn.dataset.id,user=room.users.find(u=>u.id===id);if(user&&confirm(`${action==='ban'?'Ban':'Kick'} ${user.name}?`))socket.emit('host:moderate',{targetId:id,action})})}
function updatePlayers(){ $('playerCount').textContent=`${room.users.length}/30`;$('liveCount').textContent=room.users.length;$('players').innerHTML=room.users.map(u=>playerHTML(u,true)).join('');$('sidePlayers').innerHTML=room.users.map(u=>playerHTML(u,isHost())).join('');bindModeration();renderChallengeTargets(); }
function renderChallengeTargets(){const s=$('challengeTarget');if(!s||!room)return;const old=s.value;s.innerHTML='<option value="">Choose a player…</option>'+room.users.filter(u=>u.id!==socket.id&&u.connected).map(u=>`<option value="${u.id}">${esc(u.avatar)} ${esc(u.name)}</option>`).join('');if([...s.options].some(o=>o.value===old))s.value=old}

socket.on('room:update',r=>{const previous=lastStatus;room=r;lastStatus=r.status;
 if(r.status==='lobby'){show('lobby');$('roomCode').textContent=r.code;updatePlayers();if(isHost()){$('startEvent').classList.remove('hidden');$('hostNote').textContent="10 rounds • 80 seconds • 2 hints. Start when ready."}else{$('startEvent').classList.add('hidden');$('hostNote').textContent='Waiting for the host to start…'}}
 else if(r.status==='drawing'){votingDrawings={};show('game');updatePlayers();renderRound();$('hostGameControls').classList.toggle('hidden',!isHost());$('hostTools').classList.toggle('hidden',!isHost());}
 else if(r.status==='voting'){if(previous==='drawing'&&r.drawerId===socket.id&&lastSubmittedRound!==r.roundIndex)submitDrawing();show('voting');renderVoting();$('nextRound').classList.toggle('hidden',!isHost());}
 else if(r.status==='finished'){show('finished');renderFinal()}
});

function renderRound(){const drawer=room.users.find(u=>u.id===room.drawerId);const active=room.activeRound||{};$('gameRoomCode').textContent=room.code;$('roundLabel').textContent=`ROUND ${room.roundIndex+1} OF ${room.rounds.length}`;$('roundType').textContent=active.title||'Random challenge';$('prompt').textContent=isDrawer()?(room.wordLocked?'Draw your chosen word':'Choose your secret word'):'Guess the drawing';$('wordHint').textContent=isDrawer()?(active.subtitle||'Pick one option. Nobody else can see it.'):(active.rule?`${active.rule} • Watch the canvas and guess in chat.`:`${drawer?drawer.avatar+' '+esc(drawer.name):'The artist'} is drawing. Type your guess in chat.`);$('drawerBadge').textContent=isDrawer()?'YOU ARE THE ARTIST':`${drawer?drawer.avatar+' '+esc(drawer.name):'ARTIST'} IS DRAWING`;const chatInput=$('chatInput');if(chatInput){chatInput.disabled=isDrawer();chatInput.placeholder=isDrawer()?'You are drawing — no guessing…':'Type a guess…'}$('chatSend').disabled=isDrawer();$('submittedBadge').classList.toggle('hidden',!(room.submitted||[]).includes(socket.id));$('submitDrawing').classList.toggle('hidden',!isDrawer());$('clearCanvas').classList.toggle('hidden',!isDrawer());document.querySelectorAll('.tool[data-tool],.swatch,#size,#fillShape,#undoDrawing,#redoDrawing').forEach(x=>x.disabled=!isDrawer());updateUndoRedo();if(!isDrawer())$('wordChoices').classList.add('hidden');startTimer(room.endsAt);if(lastCanvasRound!==room.roundIndex){lastCanvasRound=room.roundIndex;drawHistory=[];drawRedo=[];activeDrawGroup=null;clearCanvas(false,false);resizeCanvas()}if(isDrawer() && !room.wordLocked)socket.emit('words:get');}
function startTimer(end){clearInterval(timer);if(!end){$('timer').textContent='WAIT';$('timer').classList.remove('urgent');return}const tick=()=>{const s=Math.max(0,Math.ceil((end-Date.now())/1000));$('timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;$('timer').classList.toggle('urgent',s<=10);if(s<=0)clearInterval(timer)};tick();timer=setInterval(tick,250)}
function resizeCanvas(){const rect=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);const old=canvas.width?canvas.toDataURL('image/png'):'';canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old}}
window.addEventListener('resize',()=>{if($('game').classList.contains('active'))resizeCanvas()});
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
function hexRgb(hex){const h=String(hex||'#111111').replace('#','');const v=h.length===3?h.split('').map(x=>x+x).join(''):h;return[parseInt(v.slice(0,2),16)||0,parseInt(v.slice(2,4),16)||0,parseInt(v.slice(4,6),16)||0,255]}
function drawShapePath(tool,a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),rw=Math.abs(b.x-a.x),rh=Math.abs(b.y-a.y),cx=x+rw/2,cy=y+rh/2;ctx.beginPath();
 if(tool==='line'){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}
 else if(tool==='rect'){ctx.rect(x,y,rw,rh)}
 else if(tool==='circle'){ctx.ellipse(cx,cy,Math.max(rw/2,1),Math.max(rh/2,1),0,0,Math.PI*2)}
 else if(tool==='triangle'){ctx.moveTo(cx,y);ctx.lineTo(b.x,b.y);ctx.lineTo(a.x,b.y);ctx.closePath()}
 else if(tool==='diamond'){ctx.moveTo(cx,y);ctx.lineTo(b.x,cy);ctx.lineTo(cx,b.y);ctx.lineTo(a.x,cy);ctx.closePath()}
 else if(tool==='star'){const outer=Math.max(Math.min(rw,rh)/2,2),inner=outer*.42;for(let i=0;i<10;i++){const ang=-Math.PI/2+i*Math.PI/5,r=i%2===0?outer:inner;const px=cx+Math.cos(ang)*r,py=cy+Math.sin(ang)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath()}
 else if(tool==='arrow'){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,px=-uy,py=ux,head=Math.min(24,len*.35),half=Math.min(12,Math.max(4,head*.45));const tx=b.x-ux*head,ty=b.y-uy*head;ctx.moveTo(a.x+px*half,a.y+py*half);ctx.lineTo(tx+px*half,ty+py*half);ctx.lineTo(tx+px*head*.7,ty+py*head*.7);ctx.lineTo(b.x,b.y);ctx.lineTo(tx-px*head*.7,ty-py*head*.7);ctx.lineTo(tx-px*half,ty-py*half);ctx.lineTo(a.x-px*half,a.y-py*half);ctx.closePath()}
}
function drawSegment(p1,p2,opts){const w=canvas.clientWidth,h=canvas.clientHeight,a={x:p1.x*w,y:p1.y*h},b={x:p2.x*w,y:p2.y*h};ctx.save();ctx.globalCompositeOperation=opts.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=opts.color||color;ctx.fillStyle=opts.color||color;ctx.lineWidth=opts.size||6;ctx.lineCap='round';ctx.lineJoin='round';if(opts.tool==='pen'||opts.tool==='eraser'){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}else{drawShapePath(opts.tool,a,b);ctx.stroke();if(opts.fill&&opts.tool!=='line')ctx.fill()}ctx.restore()}
function fillCanvasAt(p,fillColor=color){const w=canvas.width,h=canvas.height;if(!w||!h)return false;const sx=Math.max(0,Math.min(w-1,Math.floor(p.x*w))),sy=Math.max(0,Math.min(h-1,Math.floor(p.y*h)));const data=ctx.getImageData(0,0,w,h),buf=data.data,idx=(sy*w+sx)*4,target=[buf[idx],buf[idx+1],buf[idx+2],buf[idx+3]],replacement=hexRgb(fillColor);if(target.every((v,i)=>Math.abs(v-replacement[i])<8))return false;const tolerance=32,match=(i)=>Math.abs(buf[i]-target[0])<=tolerance&&Math.abs(buf[i+1]-target[1])<=tolerance&&Math.abs(buf[i+2]-target[2])<=tolerance&&Math.abs(buf[i+3]-target[3])<=tolerance,paint=(x,y)=>{const i=(y*w+x)*4;buf[i]=replacement[0];buf[i+1]=replacement[1];buf[i+2]=replacement[2];buf[i+3]=255};const stack=[[sx,sy]];while(stack.length){let [x,y]=stack.pop();if(x<0||x>=w||y<0||y>=h||!match((y*w+x)*4))continue;let left=x;while(left>0&&match((y*w+left-1)*4))left--;let right=x;while(right<w-1&&match((y*w+right+1)*4))right++;let spanUp=false,spanDown=false;for(let xx=left;xx<=right;xx++){paint(xx,y);if(y>0){const up=(y-1)*w+xx;if(match(up*4)){if(!spanUp)stack.push([xx,y-1]);spanUp=true}else spanUp=false}if(y<h-1){const down=(y+1)*w+xx;if(match(down*4)){if(!spanDown)stack.push([xx,y+1]);spanDown=true}else spanDown=false}}}ctx.putImageData(data,0,0);return true}
function makeStroke(a,b){return {tool,color,size:+$('size').value,fill:$('fillShape').checked,x1:a.x,y1:a.y,x2:b.x,y2:b.y}}
function queueStroke(a,b){const stroke=makeStroke(a,b);pendingStrokes.push(stroke);if(!strokeFlushTimer)strokeFlushTimer=setTimeout(flushStrokes,40);return stroke}
function flushStrokes(){strokeFlushTimer=null;if(!pendingStrokes.length)return;const strokes=pendingStrokes.splice(0,40);socket.emit('draw:batch',{strokes});if(pendingStrokes.length)strokeFlushTimer=setTimeout(flushStrokes,40)}
function emitStroke(a,b){return queueStroke(a,b)}
function recordDrawGroup(group){if(!group||!group.length)return;drawHistory.push(group.map(x=>({...x})));if(drawHistory.length>700)drawHistory.shift();drawRedo=[];updateUndoRedo()}
function flattenHistory(){return drawHistory.flat().slice(-12000)}
function syncHistory(){flushStrokes();socket.emit('draw:replace',{actions:flattenHistory()});updateUndoRedo()}
function updateUndoRedo(){const u=$('undoDrawing'),r=$('redoDrawing');if(u){u.disabled=!isDrawer()||!drawHistory.length;u.classList.toggle('disabled',u.disabled)}if(r){r.disabled=!isDrawer()||!drawRedo.length;r.classList.toggle('disabled',r.disabled)}}
function replayActions(actions){clearCanvas(false,false);(actions||[]).forEach(a=>{if(a.type==='clear')clearCanvas(false,false);else if(a.type==='stroke')drawSegment({x:a.x1,y:a.y1},{x:a.x2,y:a.y2},a);else if(a.type==='fill')fillCanvasAt({x:a.x,y:a.y},a.color)});}
function rebuildFromHistory(){replayActions(flattenHistory());syncHistory()}
function undoDraw(){if(!isDrawer()||!drawHistory.length)return;drawRedo.push(drawHistory.pop());sound('click');rebuildFromHistory();toast('Undone ↶')}
function redoDraw(){if(!isDrawer()||!drawRedo.length)return;drawHistory.push(drawRedo.pop());sound('click');rebuildFromHistory();toast('Redone ↷');updateUndoRedo()}
function restoreShapePreview(p){
  if(!shapeBase)return;
  ctx.putImageData(shapeBase,0,0);
  drawSegment(shapeStart,p,{tool,color,size:+$('size').value,fill:$('fillShape').checked});
}
function scheduleShapePreview(p){
  previewPoint=p;
  if(previewRAF)return;
  previewRAF=requestAnimationFrame(()=>{previewRAF=0;if(drawing&&previewPoint)restoreShapePreview(previewPoint)});
}
canvas.addEventListener('pointerdown',e=>{if(!isDrawer())return;const p=pointerPos(e);if(tool==='fill'){if(fillCanvasAt(p,color)){socket.emit('draw:fill',{x:p.x,y:p.y,color});recordDrawGroup([{type:'fill',x:p.x,y:p.y,color}]);sound('pop')}return}drawing=true;activeDrawGroup=[];canvas.setPointerCapture(e.pointerId);shapeStart=p;if(['line','rect','circle','triangle','diamond','star','arrow'].includes(tool)){shapeBase=ctx.getImageData(0,0,canvas.width,canvas.height)}else{drawSegment(shapeStart,shapeStart,{tool,color,size:+$('size').value});activeDrawGroup.push(emitStroke(shapeStart,shapeStart))}});
canvas.addEventListener('pointermove',e=>{if(!drawing||!isDrawer())return;const p=pointerPos(e);if(['line','rect','circle','triangle','diamond','star','arrow'].includes(tool)){scheduleShapePreview(p)}else{drawSegment(shapeStart,p,{tool,color,size:+$('size').value});activeDrawGroup?.push(emitStroke(shapeStart,p));shapeStart=p}});
canvas.addEventListener('pointerup',e=>{if(!drawing)return;if(['line','rect','circle','triangle','diamond','star','arrow'].includes(tool)){const p=pointerPos(e);restoreShapePreview(p);activeDrawGroup=[emitStroke(shapeStart,p)]}drawing=false;shapeStart=null;shapeBase=null;previewPoint=null;if(previewRAF){cancelAnimationFrame(previewRAF);previewRAF=0}flushStrokes();recordDrawGroup(activeDrawGroup);activeDrawGroup=null});
canvas.addEventListener('pointercancel',()=>{if(activeDrawGroup?.length)recordDrawGroup(activeDrawGroup);drawing=false;shapeStart=null;shapeBase=null;activeDrawGroup=null;previewPoint=null;if(previewRAF){cancelAnimationFrame(previewRAF);previewRAF=0}flushStrokes()});

document.querySelectorAll('.tool[data-tool]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;$('fillWrap').classList.toggle('hidden',!['rect','circle','triangle','diamond','star','arrow'].includes(tool))});
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');color=b.dataset.color});
function clearCanvas(emit=true,record=true){ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);$('submittedBadge').classList.add('hidden');if(emit&&isDrawer()){socket.emit('draw:clear');if(record)recordDrawGroup([{type:'clear'}])}}
$('clearCanvas').onclick=()=>{if(confirm('Clear your drawing?'))clearCanvas()};$('undoDrawing').onclick=undoDraw;$('redoDrawing').onclick=redoDraw;
function submitDrawing(){if(!room||room.drawerId!==socket.id||lastSubmittedRound===room.roundIndex)return;flushStrokes();lastSubmittedRound=room.roundIndex;socket.emit('drawing:submit',{image:canvas.toDataURL('image/jpeg',.72)});$('submittedBadge').classList.remove('hidden')}
$('submitDrawing').onclick=()=>{if(!isDrawer()||!room.chosenWord)return toast('Choose a word first.');submitDrawing();toast('Drawing submitted ✓')};
$('endRound').onclick=()=>socket.emit('host:endRound');$('nextRound').onclick=()=>socket.emit('host:next');

socket.on('draw:stroke',s=>{if(room?.status==='drawing'&&room.drawerId!==socket.id)drawSegment({x:s.x1,y:s.y1},{x:s.x2,y:s.y2},s)});
socket.on('draw:batch',m=>{if(room?.status==='drawing'&&room.drawerId!==socket.id)(m.strokes||[]).forEach(s=>drawSegment({x:s.x1,y:s.y1},{x:s.x2,y:s.y2},s))});
socket.on('draw:clear',()=>{if(room?.status==='drawing'&&!isDrawer())clearCanvas(false,false)});
socket.on('draw:fill',s=>{if(room?.status==='drawing'&&room.drawerId!==socket.id)fillCanvasAt({x:s.x,y:s.y},s.color)});
socket.on('draw:sync',m=>{if(room?.status==='drawing'&&!isDrawer())replayActions(m.actions||[])});
socket.on('round:options',m=>{if(!isDrawer()||room?.wordLocked||room?.chosenWord)return;const box=$('wordChoices');box.innerHTML=`<div class="choice-head"><span>${esc(m.type?.title||'Choose your word')}</span><small>${esc(m.type?.subtitle||'Pick one')}</small></div><div class="choice-grid">${(m.options||[]).map(w=>`<button class="word-choice" data-word="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;box.classList.remove('hidden');box.classList.remove('locked');$('wordHint').textContent='Your choice is secret. Pick one and start drawing.';box.querySelectorAll('.word-choice').forEach(b=>b.onclick=()=>{if(room?.wordLocked||room?.chosenWord)return;box.querySelectorAll('.word-choice').forEach(x=>{x.disabled=true;x.classList.toggle('selected',x===b)});$('wordHint').textContent='Locking your word…';socket.timeout(5000).emit('word:choose',{word:b.dataset.word},(err,res)=>{if(err||res?.ok===false){box.querySelectorAll('.word-choice').forEach(x=>{x.disabled=false;x.classList.remove('selected')});$('wordHint').textContent='Choose one option. Your choice stays secret.';toast(res?.error||'Could not lock that word. Try again.');sound('error')}})})});
socket.on('word:chosen',m=>{if(!isDrawer())return;room.wordLocked=true;$('prompt').textContent=`Draw: ${m.word}`;$('wordHint').textContent='Word locked — the room is guessing';document.querySelectorAll('.word-choice').forEach(b=>{b.classList.toggle('selected',b.dataset.word===m.word);b.disabled=true});$('wordChoices').classList.add('locked');startTimer(m.endsAt||room.endsAt);roundFX()});
socket.on('word:locked',m=>{if(m.drawerId===socket.id)return;$('prompt').textContent='Guess the drawing';$('wordHint').textContent=`Hint 0/2: ${m.hint||'_____'}  •  fastest correct guesses score the most`;$('wordChoices').classList.add('hidden');startTimer(m.endsAt||room.endsAt)});
socket.on('hint:update',m=>{if(isDrawer())return;$('wordHint').textContent=`Hint ${m.hintsUsed||0}/${m.maxHints||2}: ${m.hint||'_____'}  •  fastest correct guesses score the most`});

$('sendChallenge').onclick=()=>{const targetId=$('challengeTarget').value,text=$('challengeInput').value.trim();if(!targetId)return toast('Choose a player first.');if(!text)return toast('Write a challenge first.');socket.emit('host:setChallenge',{targetId,text})};
socket.on('host:challengeSent',m=>{$('challengeInput').value='';toast(`Challenge sent to ${m.targetName}`)});
socket.on('challenge:received',m=>{document.querySelectorAll('.challenge-banner').forEach(x=>x.remove());const b=document.createElement('div');b.className='challenge-banner';b.innerHTML=`<b>👑 Host challenge</b><span>${esc(m.text)}</span>`;$('game').querySelector('.game-head').insertAdjacentElement('afterend',b);setTimeout(()=>b.remove(),15000)});
socket.on('moderation:removed',m=>{alert(m.banned?'You were banned from this room.':'You were kicked from this room.');location.reload()});
socket.on('guess:correct',m=>{sound('correct');confetti(16);systemMessage(`🎯 ${m.avatar} ${m.name} guessed it! +${m.points} points`, 'correct-guess');if(m.drawerId===socket.id&&m.drawerBonus)toast(`+${m.drawerBonus} artist bonus`);else toast(`${m.name} +${m.points} points`);updatePlayers()});

socket.on('drawing:submitted',m=>{votingDrawings[m.userId]=m.image;if(room?.status==='voting')renderVoting()});
function renderVoting(){clearInterval(timer);selected={best:room.votes?.best?.[socket.id]||null,worst:room.votes?.worst?.[socket.id]||null,funniest:room.votes?.funniest?.[socket.id]||null};const cats=[['best','bestGallery'],['worst','worstGallery'],['funniest','funGallery']];cats.forEach(([cat,id])=>{const el=$(id);el.innerHTML='';Object.entries(votingDrawings).forEach(([uid,img])=>{const u=room.users.find(x=>x.id===uid);if(!u)return;const d=document.createElement('button');d.type='button';d.className='drawing-card';d.innerHTML=`<img src="${img}" alt="Drawing by ${esc(u.name)}"><span class="draw-name">${esc(u.avatar)} ${esc(u.name)}</span><span class="vote-button">${uid===socket.id?'Your drawing':'Vote'}</span>`;if(uid===socket.id){d.disabled=true;d.classList.add('self')}else d.onclick=()=>{selected[cat]=uid;sound('vote');socket.emit('vote',{category:cat,targetId:uid});updateVoteStatus();renderVotingSelection()};if(selected[cat]===uid)d.classList.add('selected');el.appendChild(d)})});updateVoteStatus()}
function renderVotingSelection(){renderVoting();}
function updateVoteStatus(){const n=Object.values(selected).filter(Boolean).length;$('voteStatus').textContent=`${n}/3 awards selected`}
socket.on('vote:accepted',m=>toast(`${m.category==='best'?'Best':m.category==='worst'?'Worst':'Funniest'} vote recorded ✓`));

socket.on('chat',addMessage);socket.on('chat:history',msgs=>{$('messages').innerHTML='';msgs.forEach(addMessage)});
function addMessage(m){const d=document.createElement('div');d.className='msg'+(m.guess?' guess-msg':'');d.innerHTML=`<b>${esc(m.avatar)} ${esc(m.name)}</b><span>${esc(m.text)}</span>`;$('messages').appendChild(d);$('messages').scrollTop=$('messages').scrollHeight}
function sendChat(){const t=$('chatInput').value.trim();if(t){socket.emit('chat',{text:t});$('chatInput').value=''}}$('chatSend').onclick=sendChat;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});
function winner(cat){const c=room.awardTotals?.[cat]||{};let best=null,max=-1;for(const [id,n] of Object.entries(c)){if(n>max){max=n;best=id}}const user=best&&room.users.find(u=>u.id===best);return user?{user,votes:max}:null}
function renderFinal(){const awards=[['🏆 Best Drawing','best'],['💀 Worst Drawing','worst'],['😭 Funniest Drawing','funniest']];$('awardWinners').innerHTML=awards.map(([label,cat])=>{const w=winner(cat);return `<div class="award-winner"><b>${label}</b><span>${w?esc(w.user.avatar)+' '+esc(w.user.name)+' · '+w.votes+' vote'+(w.votes===1?'':'s'):'No votes'}</span></div>`}).join('');const arr=room.users.map(u=>{let award=0;for(const cat of ['best','worst','funniest']){const pts=cat==='best'?3:cat==='funniest'?2:1;award+=(room.awardTotals?.[cat]?.[u.id]||0)*pts}return {u,total:(u.score||0)+award,award}}).sort((a,b)=>b.total-a.total);$('leaderboard').innerHTML=arr.slice(0,12).map((x,i)=>`<div class="leader"><strong>${i+1}. ${esc(x.u.avatar)} ${esc(x.u.name)}</strong><span>${x.total} pts <small>${x.u.score||0} guess</small></span></div>`).join('')}
$('homeBtn').onclick=()=>location.reload();$('nameInput').value=localStorage.getItem('dj_name')||randomName();
