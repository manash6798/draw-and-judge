const socket = io();
const $ = id => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];
let room=null, createMode=true, timer=null;
let selected={best:null,worst:null,funniest:null};
let roundsDraft=[];
let canvas=$('canvas'), ctx=canvas.getContext('2d');
let drawing=false,last={x:0,y:0},tool='pen',color='#111111',shapeStart=null;

const adjectives=['Pixel','Cosmic','Tiny','Sleepy','Turbo','Mystic','Sneaky','Crispy','Wobbly','Golden'];
const nouns=['Bean','Fox','Potato','Goose','Wizard','Toast','Noodle','Penguin','Goblin','Mango'];
function randomName(){return adjectives[Math.floor(Math.random()*adjectives.length)]+nouns[Math.floor(Math.random()*nouns.length)]+Math.floor(Math.random()*90+10)}
function show(id){screens.forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo(0,0)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isHost(){return room&&room.hostId===socket.id}
function avatar(n){return n||'🎨'}
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),2200)}

socket.on('connect',()=>{$('online').innerHTML='<i></i> Online';$('online').style.color='#8ceab2';$('online').querySelector('i').style.background='#52d58b'});
socket.on('disconnect',()=>{$('online').innerHTML='<i></i> Reconnecting';$('online').style.color='#f0a0a0';$('online').querySelector('i').style.background='#ef7373'});

$('createBtn').onclick=()=>openSetup(true); $('joinBtn').onclick=()=>openSetup(false); $('backSetup').onclick=()=>show('home');
$('randomName').onclick=()=>{$('nameInput').value=randomName()};
function openSetup(create){
 createMode=create;$('setupTitle').textContent=create?'Create an event':'Join an event';$('continueBtn').textContent=create?'Create room':'Join room';
 $('codeBox').classList.toggle('hidden',create);$('nameInput').value=localStorage.getItem('dj_name')||randomName();$('setupError').textContent='';show('setup');
}
$('continueBtn').onclick=()=>{
 const name=$('nameInput').value.trim();
 if(!name)return $('setupError').textContent='Choose an anonymous nickname.';
 if(!createMode&&$('codeInput').value.trim().length<5)return $('setupError').textContent='Enter the 5-character room code.';
 localStorage.setItem('dj_name',name);
 socket.emit(createMode?'room:create':'room:join',createMode?{name}:{name,code:$('codeInput').value.trim()},res=>{
  if(!res?.ok){$('setupError').textContent=res?.error||'Could not connect to the room.';return}
  setTimeout(()=>socket.emit('chat:history'),50);
 });
};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);$('copyCode').textContent='Copied ✓';setTimeout(()=>$('copyCode').textContent='Copy',1300)}catch{toast('Room code: '+room.code)}};

function renderEditor(){
 roundsDraft=room.rounds.map(r=>({...r}));const el=$('roundEditor');el.innerHTML='';
 roundsDraft.forEach((r,i)=>{const row=document.createElement('div');row.className='round-row';row.innerHTML=`<input class="prompt-input" data-i="${i}" value="${esc(r.prompt)}"><input class="duration" type="number" min="15" max="180" data-i="${i}" value="${r.duration}"><button class="remove" data-i="${i}">×</button>`;el.appendChild(row)});
 el.querySelectorAll('.prompt-input').forEach(x=>x.oninput=()=>roundsDraft[+x.dataset.i].prompt=x.value);
 el.querySelectorAll('.duration').forEach(x=>x.oninput=()=>roundsDraft[+x.dataset.i].duration=Math.max(15,Math.min(180,+x.value||60)));
 el.querySelectorAll('.remove').forEach(x=>x.onclick=()=>{roundsDraft.splice(+x.dataset.i,1);room.rounds=roundsDraft;renderEditor()});
}
$('addRound').onclick=()=>{if(roundsDraft.length<12){roundsDraft.push({prompt:'Choose a funny word ✨',duration:60});room.rounds=roundsDraft;renderEditor()}};
$('startEvent').onclick=()=>socket.emit('host:start',{rounds:roundsDraft});

function playerHTML(u,moderation=false){
 const controls=moderation&&isHost()&&u.id!==socket.id&&u.connected?`<span class="player-actions"><button class="kick" data-action="kick" data-id="${u.id}">Kick</button><button class="ban" data-action="ban" data-id="${u.id}">Ban</button></span>`:'';
 return `<div class="player"><div class="avatar">${avatar(u.avatar)}</div><span class="pname">${esc(u.name)}</span>${u.id===room.hostId?'<span class="host-tag">HOST</span>':''}${controls}</div>`;
}
function bindModeration(){document.querySelectorAll('.player-actions button').forEach(btn=>btn.onclick=()=>{const action=btn.dataset.action,id=btn.dataset.id,user=room.users.find(u=>u.id===id);if(user&&confirm(`${action==='ban'?'Ban':'Kick'} ${user.name}?`))socket.emit('host:moderate',{targetId:id,action})})}
function updatePlayers(){
 $('playerCount').textContent=`${room.users.length}/30`;$('liveCount').textContent=room.users.length;
 $('players').innerHTML=room.users.map(u=>playerHTML(u,true)).join('');$('sidePlayers').innerHTML=room.users.map(u=>playerHTML(u,isHost())).join('');bindModeration();renderChallengeTargets();
}
function renderChallengeTargets(){const s=$('challengeTarget');if(!s||!room)return;const old=s.value;s.innerHTML='<option value="">Choose a player…</option>'+room.users.filter(u=>u.id!==socket.id&&u.connected).map(u=>`<option value="${u.id}">${esc(u.avatar)} ${esc(u.name)}</option>`).join('');if([...s.options].some(o=>o.value===old))s.value=old}

socket.on('room:update',r=>{
 room=r;
 if(room.status==='lobby'){
  show('lobby');$('roomCode').textContent=room.code;updatePlayers();
  if(isHost()){renderEditor();$('startEvent').classList.remove('hidden');$('addRound').classList.remove('hidden');$('hostNote').textContent="You're the host. Start when ready."}
  else{$('startEvent').classList.add('hidden');$('addRound').classList.add('hidden');$('hostNote').textContent='Waiting for the host to start…'}
 }else if(room.status==='drawing'){
  show('game');updatePlayers();renderRound();$('hostGameControls').classList.toggle('hidden',!isHost());$('hostTools').classList.toggle('hidden',!isHost());
 }else if(room.status==='voting'){
  show('voting');renderVoting();$('nextRound').classList.toggle('hidden',!isHost());
 }else if(room.status==='finished'){show('finished');renderFinal()}
});

function renderRound(){const r=room.rounds[room.roundIndex];$('roundLabel').textContent=`ROUND ${room.roundIndex+1} OF ${room.rounds.length}`;$('prompt').textContent=r.prompt||'Pick a word';$('submittedBadge').classList.toggle('hidden',!room.drawings[socket.id]);startTimer(room.endsAt);resizeCanvas(true);socket.emit('words:get')}
function startTimer(end){clearInterval(timer);const tick=()=>{const s=Math.max(0,Math.ceil((end-Date.now())/1000));$('timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(s<=0)clearInterval(timer)};tick();timer=setInterval(tick,250)}
function resizeCanvas(clear=false){const rect=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),old=(!clear&&canvas.width)?canvas.toDataURL() : '';canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old}}
window.addEventListener('resize',()=>{if($('game').classList.contains('active'))resizeCanvas(false)});
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function drawShape(a,b){ctx.save();ctx.globalCompositeOperation='source-over';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=+$('size').value;ctx.beginPath();const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);if(tool==='line'){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}else if(tool==='rect'){ctx.rect(x,y,w,h)}else if(tool==='circle'){ctx.ellipse(x+w/2,y+h/2,Math.max(w/2,1),Math.max(h/2,1),0,0,Math.PI*2)}else if(tool==='triangle'){ctx.moveTo(a.x+(b.x-a.x)/2,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(a.x,b.y);ctx.closePath()}ctx.stroke();if($('fillShape').checked&&tool!=='line')ctx.fill();ctx.restore()}
canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);last=pointerPos(e);shapeStart={...last};if(tool==='pen'||tool==='eraser'){ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=color;ctx.lineWidth=+$('size').value;ctx.beginPath();ctx.moveTo(last.x,last.y)}});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=pointerPos(e);if(['line','rect','circle','triangle'].includes(tool)){resizeCanvas(false);drawShape(shapeStart,p)}else{ctx.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=color;ctx.lineWidth=+$('size').value;ctx.lineTo(p.x,p.y);ctx.stroke()}last=p});
['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,e=>{if(!drawing)return;if(['line','rect','circle','triangle'].includes(tool))drawShape(shapeStart,pointerPos(e));drawing=false;shapeStart=null}));

document.querySelectorAll('.tool[data-tool]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tool[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;$('fillWrap').classList.toggle('hidden',!['rect','circle','triangle'].includes(tool))});
document.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');color=b.dataset.color});
function clearCanvas(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();$('submittedBadge').classList.add('hidden')}
$('clearCanvas').onclick=()=>{if(confirm('Clear your drawing?'))clearCanvas()};
$('submitDrawing').onclick=()=>{socket.emit('drawing:submit',{image:canvas.toDataURL('image/jpeg',.78)});$('submittedBadge').classList.remove('hidden');toast('Drawing submitted ✓')};
$('endRound').onclick=()=>socket.emit('host:endRound');$('nextRound').onclick=()=>socket.emit('host:next');

socket.on('words:options',m=>{const box=$('wordChoices');box.innerHTML=(m.options||[]).map(w=>`<button class="word-choice" data-word="${esc(w)}">${esc(w)}</button>`).join('');box.classList.remove('hidden');$('wordHint').textContent='Pick one word to draw';box.querySelectorAll('.word-choice').forEach(b=>b.onclick=()=>socket.emit('word:choose',{word:b.dataset.word}))});
socket.on('word:chosen',m=>{$('prompt').textContent=`Draw: ${m.word}`;$('wordHint').textContent='Your word is locked in';document.querySelectorAll('.word-choice').forEach(b=>{b.classList.toggle('selected',b.dataset.word===m.word);b.disabled=true})});
$('sendChallenge').onclick=()=>{const targetId=$('challengeTarget').value,text=$('challengeInput').value.trim();if(!targetId)return toast('Choose a player first.');if(!text)return toast('Write a challenge first.');socket.emit('host:setChallenge',{targetId,text})};
socket.on('host:challengeSent',m=>{$('challengeInput').value='';toast(`Challenge sent to ${m.targetName}`)});
socket.on('challenge:received',m=>{const b=document.createElement('div');b.className='challenge-banner';b.innerHTML=`<b>👑 Host challenge:</b> ${esc(m.text)}`;$('game').querySelector('.eventbar').insertAdjacentElement('afterend',b);setTimeout(()=>b.remove(),12000)});
socket.on('moderation:removed',m=>{alert(m.banned?'You were banned from this room.':'You were kicked from this room.');location.reload()});

function renderVoting(){
 clearInterval(timer);
 selected={
  best: room.votes?.best?.[socket.id] || selected.best || null,
  worst: room.votes?.worst?.[socket.id] || selected.worst || null,
  funniest: room.votes?.funniest?.[socket.id] || selected.funniest || null
 };
 const cats=[['best','bestGallery'],['worst','worstGallery'],['funniest','funGallery']];
 cats.forEach(([cat,id])=>{const el=$(id);el.innerHTML='';Object.entries(room.drawings||{}).forEach(([uid,img])=>{const u=room.users.find(x=>x.id===uid);if(!u)return;const d=document.createElement('button');d.type='button';d.className='drawing-card';d.innerHTML=`<img src="${img}" alt="Drawing by ${esc(u.name)}"><span class="draw-name">${esc(u.avatar)} ${esc(u.name)}</span><span class="vote-button">${uid===socket.id?'Your drawing':'Vote'}</span>`;if(uid===socket.id){d.disabled=true;d.classList.add('self')}else d.onclick=()=>{selected[cat]=uid;socket.emit('vote',{category:cat,targetId:uid});updateVoteStatus()};if(selected[cat]===uid)d.classList.add('selected');el.appendChild(d)})});updateVoteStatus()}
function updateVoteStatus(){const n=Object.values(selected).filter(Boolean).length;$('voteStatus').textContent=`${n}/3 awards selected`;}
socket.on('vote:accepted',m=>toast(`${m.category==='best'?'Best':m.category==='worst'?'Worst':'Funniest'} vote recorded ✓`));

socket.on('chat',addMessage);socket.on('chat:history',msgs=>{$('messages').innerHTML='';msgs.forEach(addMessage)});
function addMessage(m){const d=document.createElement('div');d.className='msg';d.innerHTML=`<b>${esc(m.avatar)} ${esc(m.name)}</b> ${esc(m.text)}`;$('messages').appendChild(d);$('messages').scrollTop=$('messages').scrollHeight}
function sendChat(){const t=$('chatInput').value.trim();if(t){socket.emit('chat',{text:t});$('chatInput').value=''}}$('chatSend').onclick=sendChat;$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});

function tally(cat){const c={};Object.values(room.awardTotals?.[cat]||room.votes?.[cat]||{}).forEach(id=>c[id]=(c[id]||0)+1);return c}
function winner(cat){const c=tally(cat);let best=null,max=-1;for(const [id,n] of Object.entries(c)){if(n>max){max=n;best=id}}const user=best&&room.users.find(u=>u.id===best);return user?{user,votes:max}:null}
function renderFinal(){
 const awards=[['🏆 Best Drawing','best'],['💀 Worst Drawing','worst'],['😭 Funniest Drawing','funniest']];
 $('awardWinners').innerHTML=awards.map(([label,cat])=>{const w=winner(cat);return `<div class="award-winner"><b>${label}</b><span>${w?esc(w.user.avatar)+' '+esc(w.user.name)+' · '+w.votes+' vote'+(w.votes===1?'':'s'):'No votes'}</span></div>`}).join('');
 const scores={};room.users.forEach(u=>scores[u.id]=0);['best','worst','funniest'].forEach(cat=>{const points=cat==='best'?3:cat==='funniest'?2:1;Object.entries(room.awardTotals?.[cat]||{}).forEach(([id,n])=>scores[id]=(scores[id]||0)+n*points)});
 const arr=room.users.map(u=>({u,n:scores[u.id]||0})).sort((a,b)=>b.n-a.n);$('leaderboard').innerHTML=arr.slice(0,10).map((x,i)=>`<div class="leader"><strong>${i+1}. ${esc(x.u.avatar)} ${esc(x.u.name)}</strong><span>${x.n} pts</span></div>`).join('')
}
$('homeBtn').onclick=()=>location.reload();$('nameInput').value=localStorage.getItem('dj_name')||randomName();
