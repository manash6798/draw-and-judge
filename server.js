const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 3e6, perMessageDeflate: true, connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: true }, pingInterval: 25000, pingTimeout: 20000 });
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req,res)=>res.status(200).json({ok:true,rooms:rooms.size}));

const MAX_PLAYERS = 30;
const rooms = new Map();
const DEFAULT_ROUNDS = buildRoundDeck();
const MAX_HINTS = 2;

// Current official VALORANT agent roster, including Miks and Veto.
const VALORANT_AGENTS = [
  "Astra","Breach","Brimstone","Chamber","Clove","Cypher","Deadlock","Fade","Gekko","Harbor",
  "Iso","Jett","KAY/O","Killjoy","Miks","Neon","Omen","Phoenix","Raze","Reyna","Sage","Skye",
  "Sova","Tejo","Veto","Viper","Vyse","Waylay","Yoru"
];
const ANIME_WORDS = ["Nezuko","Tanjiro","Zenitsu","Inosuke","Giyu","Shinobu","Rengoku","Mitsuri","Tengen","Muichiro","Akaza","Daki","Muzan"];
const OBJECT_WORDS = ["cat","dog","lion","tiger","elephant","giraffe","monkey","gorilla","panda","koala","bear","wolf","fox","deer","rabbit","hare","squirrel","hamster","mouse","rat","horse","pony","zebra","donkey","cow","pig","sheep","goat","chicken","rooster","duck","goose","swan","eagle","owl","parrot","crow","raven","pigeon","flamingo","penguin","peacock","sparrow","robin","hummingbird","butterfly","moth","bee","wasp","ant","spider","ladybug","beetle","dragonfly","caterpillar","snail","slug","frog","toad","turtle","tortoise","lizard","crocodile","alligator","snake","cobra","python","shark","whale","dolphin","seal","walrus","octopus","squid","crab","lobster","shrimp","jellyfish","starfish","seahorse","goldfish","salmon","tuna","trout","ray","stingray","bat","hedgehog","otter","beaver","badger","raccoon","skunk","moose","bison","camel","llama","alpaca","kangaroo","hippo","rhino","cheetah","leopard","jaguar","panther","chimpanzee","meerkat","sloth","pelican","toucan","woodpecker","turkey","ostrich","emu","pizza","burger","hamburger","hotdog","sandwich","taco","burrito","nachos","fries","popcorn","pretzel","pancake","waffle","cereal","toast","bread","baguette","croissant","donut","doughnut","cupcake","cake","cookie","brownie","muffin","pie","cheesecake","ice","cream","popsicle","pudding","jelly","jam","honey","chocolate","candy","lollipop","marshmallow","caramel","apple","banana","orange","lemon","lime","mango","pineapple","watermelon","strawberry","blueberry","raspberry","blackberry","cherry","peach","pear","grape","coconut","avocado","tomato","potato","carrot","onion","garlic","broccoli","cauliflower","corn","peas","beans","mushroom","pumpkin","cucumber","lettuce","spinach","cabbage","pepper","chili","ginger","rice","noodles","pasta","spaghetti","macaroni","lasagna","ravioli","soup","curry","sushi","ramen","dumpling","kebab","steak","bacon","sausage","egg","omelet","cheese","yogurt","milk","butter","coffee","tea","juice","soda","lemonade","smoothie","milkshake","water","boba","salad","pickle","peanut","chips","biscuit","cracker","syrup","salt","ketchup","mustard","mayonnaise","barbecue","sauce","chair","table","desk","bed","sofa","couch","lamp","mirror","clock","watch","phone","laptop","computer","keyboard","monitor","camera","television","radio","speaker","headphones","microphone","tablet","book","notebook","pencil","pen","crayon","marker","eraser","ruler","scissors","glue","stapler","backpack","suitcase","umbrella","wallet","key","lock","bottle","cup","mug","glass","plate","bowl","spoon","fork","knife","pan","pot","kettle","toaster","blender","fridge","refrigerator","oven","microwave","fan","vacuum","broom","mop","bucket","soap","toothbrush","toothpaste","comb","brush","towel","pillow","blanket","mattress","curtain","carpet","rug","candle","vase","flowerpot","plant","basket","box","bag","rope","string","balloon","kite","toy","ball","dice","puzzle","blocks","doll","teddy","robot","controller","console","joystick","helmet","glasses","sunglasses","hat","cap","crown","ring","necklace","bracelet","flashlight","battery","magnet","compass","telescope","binoculars","tripod","painting","frame","calendar","map","globe","ticket","coin","money","stamp","envelope","letter","newspaper","magazine","sign","flag","bell","whistle","drum","guitar","piano","violin","trumpet","saxophone","flute","skateboard","bicycle","scooter","motorcycle","car","bus","truck","taxi","ambulance","firetruck","tractor","train","subway","tram","boat","ship","canoe","yacht","sailboat","airplane","helicopter","rocket","spaceship","submarine","drone","house","home","castle","palace","school","classroom","library","museum","hospital","restaurant","cafe","bakery","supermarket","market","shop","mall","cinema","theater","stadium","park","playground","garden","zoo","farm","beach","island","mountain","volcano","desert","forest","jungle","river","lake","waterfall","cave","tunnel","bridge","road","street","city","village","town","office","factory","airport","station","harbor","port","campsite","hotel","bedroom","bathroom","kitchen","garage","attic","basement","rooftop","temple","tower","lighthouse","windmill","doctor","nurse","teacher","student","chef","baker","farmer","police","officer","firefighter","astronaut","pilot","sailor","pirate","wizard","witch","knight","king","queen","princess","prince","superhero","villain","detective","artist","painter","sculptor","singer","dancer","musician","magician","clown","cowboy","explorer","scientist","engineer","mechanic","builder","gardener","photographer","reporter","athlete","coach","referee","soldier","monk","ninja","samurai","van","jeep","race","sports","jet","kayak","roller","skates","hot","air","parachute","sun","moon","star","cloud","rainbow","rain","snow","storm","tornado","lightning","thunder","wind","fire","ocean","sea","wave","hill","tree","palm","cactus","flower","rose","sunflower","tulip","daisy","leaf","acorn","seed","branch","log","rock","stone","pebble","sand","snowman","icicle","sunset","sunrise","eclipse","comet","planet","galaxy","dragon","unicorn","mermaid","fairy","elf","ogre","giant","troll","goblin","vampire","ghost","mummy","zombie","skeleton","monster","alien","genie","treasure","magic","wand","potion","spell","crystal","dungeon","sword","shield","bow","arrow","armor","chest","flying","portal","time","machine","football","soccer","basketball","baseball","cricket","tennis","badminton","volleyball","hockey","golf","bowling","boxing","wrestling","racing","cycling","swimming","diving","surfing","skiing","snowboarding","archery","darts","billiards","chess","medal","trophy","jersey","racket","goal","net","video","game","arcade","checkers","cards","minecraft","pixel","character","gamepad","boss","level","power","up","quest","angry","sleepy","tiny","dancing","sneezing","confused","singing","invisible","lazy","disco","secret","agent","wearing","with","wheels","floating","on","vacation","at","dj","love","friendship","happiness","sadness","surprise","anger","fear","dream","idea","mystery","adventure","problem","solution","teamwork","luck","future","past","memory","story","joke","music","art","noise","silence","speed","balance","energy","shadow","light","darkness","beginning","ending","winner","loser","anchor","axe","badge","button","chain","chimney","circle","coat","door","drawer","feather","fence","ladder","hammer","mailbox","nail","needle","paintbrush","petal","pocket","ribbon","sail","scarf","shell","shovel","sock","swing","tent","thread","tire","zipper","wheel","window","accordion","alarm clock","ant hill","apron","aquarium","backyard","baseball glove","beehive","birdhouse","bookshelf","bow tie","camping tent","canoe paddle","carrot cake","chewing gum","chocolate bar","coat hanger","coffee cup","comic book","cookie jar","cooking pot","crayon box","doorbell","eggplant","eyepatch","frying pan","garden hose","gift box","gumball machine","hair dryer","ice cube","jam jar","jump rope","keychain","paint palette","paper airplane","paperclip","picnic basket","rain boots","remote control","sandcastle","sewing machine","shopping cart","skipping rope","snow globe","soap bubble","spinning top","sticker","swing set","thermos","traffic light","treasure map","wind sock","yo-yo"];

function buildRoundDeck(){
  const deck=[
    {theme:"valorant-main",duration:80},
    {theme:"valorant-agent",duration:80},
    {theme:"anime",duration:80},
    {theme:"anime",duration:80},
    ...Array.from({length:6},()=>({theme:"random",duration:80}))
  ];
  return shuffle(deck);
}


const ROUND_TYPES = [
  { id: "valorant-main", title: "Your VALORANT main", subtitle: "Pick any Agent from the roster and draw them." },
  { id: "valorant-agent", title: "Draw a VALORANT Agent from memory", subtitle: "Choose an Agent yourself, then draw it from memory." },
  { id: "member", title: "Draw another member", subtitle: "Pick a player in the room and draw them." },
  { id: "anime", title: "Draw an anime character", subtitle: "Pick a character from the secret character board." },
  { id: "object", title: "Random doodle", subtitle: "Pick any word from the random doodle board." },
  { id: "challenge", title: "Chaos challenge", subtitle: "Pick a word and follow the round rule." }
];

const avatarSet = ["🎨","🦊","🐸","🐼","🐱","🐙","🦄","👽","🤖","🍀","🌙","⭐","🍉","🍩","🧃","🦋","🐨","🐯","🐵","🍓","🌈","⚡","🔥","❄️","🌸","🪐","🎧","🕹️","👾","🥷"];
const CHAOS_RULES = ["only use 3 colors", "don't use circles", "draw with your non-dominant hand", "use only shapes", "no erasing", "draw with one continuous line"];

function shuffle(arr){ return [...arr].sort(() => Math.random() - 0.5); }
function makeCode(){ let c; do c=Math.random().toString(36).slice(2,7).toUpperCase(); while(rooms.has(c)); return c; }
function cleanName(name){ return String(name||"").trim().replace(/\s+/g," ").slice(0,20); }
function nameKey(name){ return cleanName(name).toLowerCase(); }
function randomAvatar(room){ const available=avatarSet.filter(a=>!room.usedAvatars.has(a)); const pool=available.length?available:avatarSet; const avatar=pool[Math.floor(Math.random()*pool.length)]; room.usedAvatars.add(avatar); return avatar; }
function normalizeGuess(text){ return String(text||"").toLowerCase().trim().replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," "); }
function maskWord(word, hintLevel=0){
  let revealBudget=Math.max(1, 1+Math.min(MAX_HINTS, Number(hintLevel)||0));
  return String(word||"").split(" ").map(part=>{
    let seen=0;
    return part.replace(/[a-z0-9]/gi,m=>{
      const show=seen<revealBudget; seen++; return show?m:"_";
    });
  }).join("   ");
}
function publicUser(u){ return {id:u.id,name:u.name,avatar:u.avatar,score:u.score,connected:u.connected,correct:u.correct}; }
function roomJSON(room){ return {code:room.code,hostId:room.hostId,status:room.status,roundIndex:room.roundIndex,rounds:room.rounds,activeRound:room.activeRound,endsAt:room.endsAt,drawerId:room.drawerId,guessedIds:[...room.guessedIds],users:[...room.users.values()].map(publicUser),submitted:Object.keys(room.drawings),votes:room.votes,awardTotals:room.awardTotals}; }
function emitRoom(room){ io.to(room.code).emit("room:update",roomJSON(room)); }
function setNewHost(room){ const candidate=[...room.users.values()].find(u=>u.connected)||[...room.users.values()][0]; room.hostId=candidate?candidate.id:null; }
function connectedUsers(room){ return [...room.users.values()].filter(u=>u.connected); }
function optionsForType(room,type){
  if(type.id === "valorant-main" || type.id === "valorant-agent") return shuffle(VALORANT_AGENTS);
  if(type.id === "member") return shuffle(connectedUsers(room).filter(u=>u.id!==room.drawerId).map(u=>u.name));
  if(type.id === "anime") return shuffle(ANIME_WORDS);
  if(type.id === "challenge") return shuffle(OBJECT_WORDS).slice(0, Math.min(24, OBJECT_WORDS.length));
  return shuffle(OBJECT_WORDS);
}
function startRound(room,index){
  const players=connectedUsers(room); if(!players.length)return;
  const base=room.rounds[index] || DEFAULT_ROUNDS[0];
  const type=base.theme==="random" ? ROUND_TYPES[Math.floor(Math.random()*ROUND_TYPES.length)] : (ROUND_TYPES.find(t=>t.id===base.theme)||ROUND_TYPES[0]);
  room.roundIndex=index; room.status="drawing"; room.drawings={}; room.drawActions=[]; room.votes={best:{},worst:{},funniest:{}}; room.guessedIds=new Set(); room.guessOrder=[];
  room.drawerId=players[index%players.length].id; room.chosenWord=""; room.playerOptions=new Map(); room.hintLevel=0; room.endsAt=Date.now()+base.duration*1000;
  room.activeRound={id:type.id,title:type.title,subtitle:type.subtitle,rule:type.id==="challenge"?CHAOS_RULES[Math.floor(Math.random()*CHAOS_RULES.length)]:null};
  const options=optionsForType(room,type); room.playerOptions.set(room.drawerId,options);
  io.to(room.drawerId).emit("round:options",{type:room.activeRound,options});
  io.to(room.code).emit("round:started",{drawerId:room.drawerId,type:room.activeRound});
}
function enterVoting(room){ if(room.status!=="drawing")return; room.status="voting"; room.endsAt=null; room.chosenWord=""; room.hintLevel=0; room.playerOptions=new Map(); room.activeRound=null; room.votes={best:{},worst:{},funniest:{}}; emitRoom(room); }

io.on("connection",socket=>{
  socket.on("room:create",({name},cb)=>{
    name=cleanName(name); if(!name)return cb?.({ok:false,error:"Choose an anonymous nickname first."});
    const code=makeCode();
    const room={code,hostId:socket.id,status:"lobby",roundIndex:-1,rounds:buildRoundDeck(),activeRound:null,endsAt:null,drawerId:null,chosenWord:"",users:new Map(),drawings:{},votes:{best:{},worst:{},funniest:{}},chat:[],usedAvatars:new Set(),bannedNames:new Set(),challenges:new Map(),awardTotals:{best:{},worst:{},funniest:{}},playerOptions:new Map(),guessedIds:new Set(),guessOrder:[],hintLevel:0,drawActions:[]};
    room.users.set(socket.id,{id:socket.id,name,avatar:randomAvatar(room),score:0,correct:0,connected:true}); rooms.set(code,room); socket.join(code); socket.data.room=code; cb?.({ok:true,code}); emitRoom(room);
  });
  socket.on("room:join",({code,name},cb)=>{
    code=String(code||"").trim().toUpperCase(); name=cleanName(name); const room=rooms.get(code);
    if(!room)return cb?.({ok:false,error:"That room doesn't exist."}); if(!name)return cb?.({ok:false,error:"Choose an anonymous nickname first."}); if(room.bannedNames.has(nameKey(name)))return cb?.({ok:false,error:"You are banned from this room."}); if(connectedUsers(room).length>=MAX_PLAYERS)return cb?.({ok:false,error:"This room is full (30 players)."});
    room.users.set(socket.id,{id:socket.id,name,avatar:randomAvatar(room),score:0,correct:0,connected:true}); socket.join(code); socket.data.room=code; cb?.({ok:true,code}); emitRoom(room);
    if(room.status==='drawing'){
      socket.emit('draw:sync',{actions:room.drawActions||[]});
      if(room.chosenWord) socket.emit('word:locked',{drawerId:room.drawerId,hint:maskWord(room.chosenWord,room.hintLevel||0),hintsUsed:room.hintLevel||0,maxHints:MAX_HINTS,round:room.activeRound});
    } else if(room.status==='voting') {
      for(const [userId,image] of Object.entries(room.drawings||{})) socket.emit('drawing:submitted',{userId,image});
    }
  });
  socket.on("host:start",({rounds},cb)=>{ const room=rooms.get(socket.data.room); if(!room||room.hostId!==socket.id||room.status!=="lobby")return cb?.({ok:false,error:"The room is no longer ready to start."}); if(Array.isArray(rounds)&&rounds.length)room.rounds=rounds.slice(0,12).map(r=>({theme:ROUND_TYPES.some(t=>t.id===r.theme)?r.theme:"random",duration:Math.max(30,Math.min(180,Number(r.duration)||80))})); if(!room.rounds?.length)room.rounds=buildRoundDeck(); startRound(room,0); emitRoom(room); cb?.({ok:true}); });
  socket.on("host:endRound",()=>{const room=rooms.get(socket.data.room);if(room&&room.hostId===socket.id)enterVoting(room);});
  socket.on("host:next",()=>{const room=rooms.get(socket.data.room);if(!room||room.hostId!==socket.id||room.status!=="voting")return;const next=room.roundIndex+1;if(next>=room.rounds.length){room.status="finished";room.endsAt=null;emitRoom(room);return;}startRound(room,next);emitRoom(room);});
  socket.on("words:get",()=>{const room=rooms.get(socket.data.room);if(!room||room.status!=="drawing"||room.drawerId!==socket.id)return;socket.emit("round:options",{type:room.activeRound,options:room.playerOptions.get(socket.id)||[]});});
  socket.on("word:choose",({word})=>{
    const room=rooms.get(socket.data.room); if(!room||room.status!=="drawing"||room.drawerId!==socket.id)return;
    const options=room.playerOptions.get(socket.id)||[]; word=String(word||"").trim(); if(!options.includes(word))return;
    room.chosenWord=word; room.hintLevel=0; io.to(socket.id).emit("word:chosen",{word}); io.to(room.code).emit("word:locked",{drawerId:socket.id,hint:maskWord(word,0),hintsUsed:0,maxHints:MAX_HINTS,round:room.activeRound}); emitRoom(room);
  });
  socket.on("host:setChallenge",({targetId,text})=>{const room=rooms.get(socket.data.room);if(!room||room.hostId!==socket.id||room.status!=="drawing")return;text=String(text||"").trim().slice(0,180);if(!text)return;const target=room.users.get(targetId);if(!target||target.id===socket.id)return;room.challenges.set(targetId,text);io.to(targetId).emit("challenge:received",{text,fromHost:true});socket.emit("host:challengeSent",{targetId,targetName:target.name,text});});
  socket.on("host:moderate",({targetId,action})=>{const room=rooms.get(socket.data.room);if(!room||room.hostId!==socket.id||!targetId||targetId===socket.id)return;const target=room.users.get(targetId);if(!target||!['kick','ban'].includes(action))return;if(action==='ban')room.bannedNames.add(nameKey(target.name));io.to(targetId).emit("moderation:removed",{banned:action==='ban'});const targetSocket=io.sockets.sockets.get(targetId);room.users.delete(targetId);delete room.drawings[targetId];room.challenges.delete(targetId);for(const category of ['best','worst','funniest']){delete room.votes[category][targetId];for(const voterId of Object.keys(room.votes[category]))if(room.votes[category][voterId]===targetId)delete room.votes[category][voterId];}if(room.drawerId===targetId&&room.status==='drawing')enterVoting(room);if(targetSocket)targetSocket.disconnect(true);emitRoom(room);});
  function normalizeStroke(p){
    const allowed=["pen","eraser","line","rect","circle","triangle","diamond","star","arrow"];
    if(!allowed.includes(p?.tool)) return null;
    const n=v=>Math.max(0,Math.min(1,Number(v)||0));
    return {tool:p.tool,color:String(p.color||"#111111").slice(0,20),size:Math.max(1,Math.min(40,Number(p.size)||6)),fill:!!p.fill,x1:n(p.x1),y1:n(p.y1),x2:n(p.x2),y2:n(p.y2)};
  }
  socket.on("draw:stroke",payload=>{
    const room=rooms.get(socket.data.room); if(!room||room.status!=="drawing"||room.drawerId!==socket.id||!room.chosenWord)return;
    const stroke=normalizeStroke(payload||{}); if(!stroke)return;
    room.drawActions.push({type:"stroke",...stroke}); if(room.drawActions.length>12000)room.drawActions.splice(0,2000);
    socket.to(room.code).emit("draw:stroke",stroke);
  });
  socket.on("draw:batch",payload=>{
    const room=rooms.get(socket.data.room); if(!room||room.status!=="drawing"||room.drawerId!==socket.id||!room.chosenWord)return;
    const incoming=Array.isArray(payload?.strokes)?payload.strokes.slice(0,40):[]; const strokes=incoming.map(normalizeStroke).filter(Boolean); if(!strokes.length)return;
    room.drawActions.push(...strokes.map(stroke=>({type:"stroke",...stroke}))); if(room.drawActions.length>12000)room.drawActions.splice(0,2000);
    socket.to(room.code).emit("draw:batch",{strokes});
  });
  socket.on("draw:fill",payload=>{const room=rooms.get(socket.data.room);if(!room||room.status!=="drawing"||room.drawerId!==socket.id||!room.chosenWord)return;const p=payload||{};const n=v=>Math.max(0,Math.min(1,Number(v)||0));const fill={x:n(p.x),y:n(p.y),color:String(p.color||"#111111").slice(0,20)};room.drawActions.push({type:"fill",...fill});if(room.drawActions.length>12000)room.drawActions.splice(0,2000);socket.to(room.code).emit("draw:fill",fill);});
  socket.on("draw:clear",()=>{const room=rooms.get(socket.data.room);if(room&&room.status==='drawing'&&room.drawerId===socket.id){room.drawActions=[{type:"clear"}];io.to(room.code).emit("draw:clear");}});
  socket.on("drawing:submit",({image})=>{
    const room=rooms.get(socket.data.room); if(!room||!["drawing","voting"].includes(room.status)||room.drawerId!==socket.id||!room.chosenWord)return;
    if(typeof image!=="string"||image.length>2500000)return;
    room.drawings[socket.id]=image;
    io.to(room.code).emit("drawing:submitted",{userId:socket.id,image});
    emitRoom(room);
  });
  socket.on("vote",({category,targetId})=>{const room=rooms.get(socket.data.room);if(!room||room.status!=="voting"||!['best','worst','funniest'].includes(category)||!room.users.has(targetId)||targetId===socket.id)return;const previous=room.votes[category][socket.id];if(previous===targetId)return;if(previous)room.awardTotals[category][previous]=Math.max(0,(room.awardTotals[category][previous]||0)-1);room.votes[category][socket.id]=targetId;room.awardTotals[category][targetId]=(room.awardTotals[category][targetId]||0)+1;socket.emit("vote:accepted",{category,targetId});emitRoom(room);});
  socket.on("chat",({text})=>{
    const room=rooms.get(socket.data.room);if(!room)return;const user=room.users.get(socket.id);if(!user)return;text=String(text||"").trim().slice(0,300);if(!text)return;
    if(room.status==='drawing'&&room.drawerId&&socket.id!==room.drawerId&&room.chosenWord&&!room.guessedIds.has(socket.id)){
      if(normalizeGuess(text)===normalizeGuess(room.chosenWord)){
        const remaining=Math.max(0,Math.ceil((room.endsAt-Date.now())/1000));
        const place=room.guessOrder.length;
        const points=Math.max(20,Math.round(140+remaining*2-place*20));
        user.score+=points; user.correct+=1; room.guessedIds.add(socket.id); room.guessOrder.push(socket.id);
        io.to(room.code).emit("guess:correct",{userId:user.id,name:user.name,avatar:user.avatar,points,total:user.score,place:place+1}); emitRoom(room); return;
      }
    }
    const message={id:Date.now()+Math.random(),name:user.name,avatar:user.avatar,text,time:Date.now(),guess:true};room.chat.push(message);if(room.chat.length>150)room.chat.shift();io.to(room.code).emit("chat",message);
  });
  socket.on("chat:history",()=>{const room=rooms.get(socket.data.room);if(room)socket.emit("chat:history",room.chat);});
  socket.on("disconnect",()=>{const room=rooms.get(socket.data.room);if(!room)return;const user=room.users.get(socket.id);if(user)user.connected=false;if(room.hostId===socket.id)setNewHost(room);emitRoom(room);setTimeout(()=>{const r=rooms.get(room.code);if(r&&!connectedUsers(r).length)rooms.delete(room.code);},10*60*1000);});
});
setInterval(()=>{
  for(const room of rooms.values()){
    if(room.status!=="drawing"||!room.endsAt) continue;
    const remaining=Math.max(0,Math.ceil((room.endsAt-Date.now())/1000));
    if(room.chosenWord){
      const targetLevel=remaining<=20?2:remaining<=40?1:0;
      if(targetLevel>room.hintLevel){
        room.hintLevel=targetLevel;
        io.to(room.code).emit("hint:update",{hint:maskWord(room.chosenWord,room.hintLevel),hintsUsed:room.hintLevel,maxHints:MAX_HINTS});
      }
    }
    if(remaining<=0) enterVoting(room);
  }
},500);
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`Draw & Judge listening on ${PORT}`));
