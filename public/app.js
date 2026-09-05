
const socket = io();
const $ = id => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];

let room = null, createMode = true, meName = "", timer = null;
let selected = {best:null,worst:null,funniest:null};
let roundsDraft = [];
let canvas = $("canvas"), ctx = canvas.getContext("2d");
let drawing = false, last = {x:0,y:0}, tool = "pen";

const adjectives=["Pixel","Cosmic","Tiny","Sleepy","Turbo","Mystic","Sneaky","Crispy","Wobbly","Golden"];
const nouns=["Bean","Fox","Potato","Goose","Wizard","Toast","Noodle","Penguin","Goblin","Mango"];
function randomName(){return adjectives[Math.floor(Math.random()*adjectives.length)]+nouns[Math.floor(Math.random()*nouns.length)]+Math.floor(Math.random()*90+10)}
function show(id){screens.forEach(s=>s.classList.toggle("active",s.id===id));window.scrollTo(0,0)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function isHost(){return room && room.hostId===socket.id}
function avatar(n){return n || "🎨"}

socket.on("connect",()=>{$("online").innerHTML="<i></i> Online";$("online").style.color="#8ceab2";$("online").querySelector("i").style.background="#52d58b"});
socket.on("disconnect",()=>{$("online").innerHTML="<i></i> Reconnecting";$("online").style.color="#f0a0a0";$("online").querySelector("i").style.background="#ef7373"});

$("createBtn").onclick=()=>openSetup(true);
$("joinBtn").onclick=()=>openSetup(false);
$("backSetup").onclick=()=>show("home");
$("randomName").onclick=()=>{$("nameInput").value=randomName()};
function openSetup(create){
  createMode=create;
  $("setupTitle").textContent=create?"Create an event":"Join an event";
  $("continueBtn").textContent=create?"Create room":"Join room";
  $("codeBox").classList.toggle("hidden",create);
  $("nameInput").value=localStorage.getItem("dj_name")||randomName();
  $("setupError").textContent="";
  show("setup");
}
$("continueBtn").onclick=()=>{
  const name=$("nameInput").value.trim();
  if(!name)return $("setupError").textContent="Choose an anonymous nickname.";
  if(!createMode && $("codeInput").value.trim().length<5)return $("setupError").textContent="Enter the 5-character room code.";
  meName=name; localStorage.setItem("dj_name",name);
  socket.emit(createMode?"room:create":"room:join",
    createMode?{name}:{name,code:$("codeInput").value.trim()},
    res=>{
      if(!res?.ok){$("setupError").textContent=res?.error||"Couldn't connect to the room.";return}
      setTimeout(()=>socket.emit("chat:history"), 50);
    });
};

$("copyCode").onclick=async()=>{
  try{await navigator.clipboard.writeText(room.code);$("copyCode").textContent="Copied ✓";setTimeout(()=>$("copyCode").textContent="Copy",1300)}catch{}
};

function defaultRounds(){return [
  {prompt:"Draw your Valorant main 🎯",duration:60},
  {prompt:"Draw another member 👤",duration:60},
  {prompt:"Draw Awnezuko 💀",duration:60},
  {prompt:"Draw something WITHOUT lifting your mouse 🖱️",duration:45},
  {prompt:"Draw a Valorant agent from memory 🧠",duration:60}
]}
function renderEditor(){
  roundsDraft = room.rounds.map(r=>({...r}));
  const el=$("roundEditor");el.innerHTML="";
  roundsDraft.forEach((r,i)=>{
    const row=document.createElement("div");row.className="round-row";
    row.innerHTML=`<input class="prompt-input" data-i="${i}" value="${esc(r.prompt)}"><input class="duration" type="number" min="15" max="180" data-i="${i}" value="${r.duration}"><button class="remove" data-i="${i}">×</button>`;
    el.appendChild(row);
  });
  el.querySelectorAll(".prompt-input").forEach(x=>x.oninput=()=>roundsDraft[+x.dataset.i].prompt=x.value);
  el.querySelectorAll(".duration").forEach(x=>x.oninput=()=>roundsDraft[+x.dataset.i].duration=Math.max(15,Math.min(180,+x.value||60)));
  el.querySelectorAll(".remove").forEach(x=>x.onclick=()=>{roundsDraft.splice(+x.dataset.i,1);room.rounds=roundsDraft;renderEditor()});
}
$("addRound").onclick=()=>{if(roundsDraft.length<12){roundsDraft.push({prompt:"Free draw ✨",duration:60});room.rounds=roundsDraft;renderEditor()}};
$("startEvent").onclick=()=>socket.emit("host:start",{rounds:roundsDraft});

function playerHTML(u, moderation=false){
 const controls = moderation && isHost() && u.id!==socket.id && u.connected
   ? `<span class="player-actions"><button class="kick" data-action="kick" data-id="${u.id}">Kick</button><button class="ban" data-action="ban" data-id="${u.id}">Ban</button></span>` : "";
 return `<div class="player"><div class="avatar">${avatar(u.avatar)}</div><span class="pname">${esc(u.name)}</span>${u.id===room.hostId?'<span class="host-tag">HOST</span>':''}${controls}</div>`;
}
function bindModeration(){
 document.querySelectorAll('.player-actions button').forEach(btn=>btn.onclick=()=>{
   const action=btn.dataset.action, id=btn.dataset.id;
   const user=room.users.find(u=>u.id===id); if(!user)return;
   const label=action==='ban'?'Ban':'Kick';
   if(confirm(`${label} ${user.name}?`)) socket.emit('host:moderate',{targetId:id,action});
 });
}
function updatePlayers(){
 const users=room.users;
 $("playerCount").textContent=`${users.length}/30`;
 $("liveCount").textContent=users.length;
 $("players").innerHTML=users.map(u=>playerHTML(u,true)).join("");
 $("sidePlayers").innerHTML=users.map(u=>playerHTML(u,isHost())).join("");
 bindModeration();
 if($('challengeTarget')) renderChallengeTargets();
}
function renderChallengeTargets(){
  const select=$('challengeTarget'); if(!select || !room)return;
  const current=select.value;
  select.innerHTML=`<option value="">Choose a player…</option>`+room.users.filter(u=>u.id!==socket.id&&u.connected).map(u=>`<option value="${u.id}">${esc(u.avatar)} ${esc(u.name)}</option>`).join('');
  if([...select.options].some(o=>o.value===current))select.value=current;
}

socket.on("room:update",r=>{
  room=r;
  if(room.status==="lobby"){
    show("lobby");$("roomCode").textContent=room.code;updatePlayers();
    if(isHost()){renderEditor();$("startEvent").classList.remove("hidden");$("addRound").classList.remove("hidden");$("hostNote").textContent="You're the host. Start when ready."}
    else {$("startEvent").classList.add("hidden");$("addRound").classList.add("hidden");$("hostNote").textContent="Waiting for the host to start…"}
  } else if(room.status==="drawing"){
    show("game");updatePlayers();renderRound();
    $("hostGameControls").classList.toggle("hidden",!isHost());
    $("hostTools").classList.toggle("hidden",!isHost());
    renderChallengeTargets();
  } else if(room.status==="voting"){
    show("voting");renderVoting();$("nextRound").classList.toggle("hidden",!isHost());
  } else if(room.status==="finished"){
    show("finished");renderFinal();
  }
});

function renderRound(){
 const r=room.rounds[room.roundIndex];
 $("roundLabel").textContent=`ROUND ${room.roundIndex+1} OF ${room.rounds.length}`;
 $("prompt").textContent=r.prompt;
 $("submittedBadge").classList.toggle("hidden",!room.drawings[socket.id]);
 startTimer(room.endsAt);
 resizeCanvas(true);
}
function startTimer(end){
 clearInterval(timer);
 const tick=()=>{
   const s=Math.max(0,Math.ceil((end-Date.now())/1000));
   $("timer").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
   if(s<=0)clearInterval(timer);
 };
 tick();timer=setInterval(tick,250);
}
function resizeCanvas(clear=false){
 const rect=canvas.parentElement.getBoundingClientRect();
 const dpr=Math.min(window.devicePixelRatio||1,2);
 const old=(!clear && canvas.width)?canvas.toDataURL():"";
 canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap="round";ctx.lineJoin="round";
 if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old}
}
window.addEventListener("resize",()=>{if($("game").classList.contains("active"))resizeCanvas(false)});
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener("pointerdown",e=>{drawing=true;canvas.setPointerCapture(e.pointerId);last=pointerPos(e)});
canvas.addEventListener("pointermove",e=>{
 if(!drawing)return;
 const p=pointerPos(e);
 ctx.globalCompositeOperation=tool==="eraser"?"destination-out":"source-over";
 ctx.strokeStyle="#111";ctx.lineWidth=+$("size").value;
 ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;
});
["pointerup","pointercancel"].forEach(ev=>canvas.addEventListener(ev,()=>drawing=false));
document.querySelectorAll(".tool[data-tool]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".tool[data-tool]").forEach(x=>x.classList.remove("active"));b.classList.add("active");tool=b.dataset.tool;
});
function clearCanvas(){
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore();
 $("submittedBadge").classList.add("hidden");
}
$("clearCanvas").onclick=()=>{if(confirm("Clear your drawing?"))clearCanvas()};
$("submitDrawing").onclick=()=>{
 socket.emit("drawing:submit",{image:canvas.toDataURL("image/jpeg",.78)});
 $("submittedBadge").classList.remove("hidden");
};
$("endRound").onclick=()=>socket.emit("host:endRound");
$("nextRound").onclick=()=>socket.emit("host:next");
$("sendChallenge").onclick=()=>{
  const targetId=$("challengeTarget").value, text=$("challengeInput").value.trim();
  if(!targetId)return toast("Choose a player first.");
  if(!text)return toast("Write a challenge first.");
  socket.emit("host:setChallenge",{targetId,text});
};
socket.on("host:challengeSent",m=>{ $("challengeInput").value=""; toast(`Challenge sent to ${m.targetName}`); });
socket.on("challenge:received",m=>{
  const b=document.createElement('div'); b.className='challenge-banner'; b.innerHTML=`<b>👑 Host challenge:</b> ${esc(m.text)}`;
  const game=$('game'); const top=game.querySelector('.eventbar'); top.insertAdjacentElement('afterend',b);
  setTimeout(()=>b.remove(),12000);
});
socket.on("moderation:removed",m=>{
  alert(m.banned?"You were banned from this room.":"You were kicked from this room.");
  location.reload();
});
function toast(text){
  const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),2200);
}

function renderVoting(){
 clearInterval(timer);
 selected=selected||{best:null,worst:null,funniest:null};
 const cats=[["best","bestGallery"],["worst","worstGallery"],["funniest","funGallery"]];
 cats.forEach(([cat,id])=>{
   const el=$(id);el.innerHTML="";
   Object.entries(room.drawings).forEach(([uid,img])=>{
     const u=room.users.find(x=>x.id===uid);if(!u)return;
     const d=document.createElement("div");d.className="drawing"+(selected[cat]===uid?" selected":"");
     d.innerHTML=`<img src="${img}"><div class="name">${esc(u.name)}</div>`;
     if(uid!==socket.id)d.onclick=()=>{selected[cat]=uid;socket.emit("vote",{category:cat,targetId:uid});renderVoting()};
     else d.style.cursor="not-allowed";
     el.appendChild(d);
   });
 });
 updateVoteStatus();
}
function updateVoteStatus(){
 const n=Object.values(selected).filter(Boolean).length;
 $("voteStatus").textContent=`${n}/3 selected`;
}
socket.on("chat",addMessage);
socket.on("chat:history",msgs=>msgs.forEach(addMessage));
function addMessage(m){
 const d=document.createElement("div");d.className="msg";d.innerHTML=`<b>${esc(m.avatar)} ${esc(m.name)}</b> ${esc(m.text)}`;
 $("messages").appendChild(d);$("messages").scrollTop=$("messages").scrollHeight;
}
function sendChat(){const t=$("chatInput").value.trim();if(t){socket.emit("chat",{text:t});$("chatInput").value=""}}
$("chatSend").onclick=sendChat;$("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendChat()});

function tally(cat){
 const c={};Object.values(room.votes[cat]||{}).forEach(id=>c[id]=(c[id]||0)+1);return c;
}
function winner(cat){
 const c=tally(cat);let best=null,max=-1;
 for(const [id,n] of Object.entries(c)){if(n>max){max=n;best=id}}
 return best?{user:room.users.find(u=>u.id===best),votes:max}:null;
}
function renderFinal(){
 const awards=[
   ["🏆 Best Drawing","best"],
   ["💀 Worst Drawing","worst"],
   ["😭 Funniest Drawing","funniest"]
 ];
 $("awardWinners").innerHTML=awards.map(([label,cat])=>{
   const w=winner(cat);
   return `<div class="award-winner"><b>${label}</b><span>${w?esc(w.user.name)+" · "+w.votes+" vote"+(w.votes===1?"":"s"):"No votes"}</span></div>`;
 }).join("");
 const scores={};room.users.forEach(u=>scores[u.id]=0);
 Object.entries(room.votes.best).forEach(([_,id])=>scores[id]=(scores[id]||0)+3);
 Object.entries(room.votes.funniest).forEach(([_,id])=>scores[id]=(scores[id]||0)+2);
 Object.entries(room.votes.worst).forEach(([_,id])=>scores[id]=(scores[id]||0)+1);
 const arr=room.users.map(u=>({u,n:scores[u.id]||0})).sort((a,b)=>b.n-a.n);
 $("leaderboard").innerHTML=arr.slice(0,10).map((x,i)=>`<div class="leader"><strong>${i+1}. ${esc(x.u.name)}</strong><span>${x.n} pts</span></div>`).join("");
}
$("homeBtn").onclick=()=>location.reload();

$("nameInput").value=localStorage.getItem("dj_name")||randomName();
