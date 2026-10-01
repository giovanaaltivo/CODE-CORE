(function(){
'use strict';

const W = 900;
const H = 540;
const TOTAL = 6;
const SAVE_KEY = 'firstLearningProgress_v1';
const PHASES = [
  { id:'descoberta', name:'Descoberta', icon:'🔎', color:'#65c9a3', intro:'O bosque esconde surpresas. Explore cada cantinho!', reflection:'Você descobriu coisas novas explorando e observando.', action:'Explore o bosque e revele quatro surpresas.' },
  { id:'inovacao', name:'Inovação', icon:'💡', color:'#f4b942', intro:'O rio bloqueou o caminho.', reflection:'Criamos um caminho novo!', action:'Leve a madeira até a outra margem.' },
  { id:'impacto', name:'Impacto', icon:'🌱', color:'#71bd58', intro:'A praça está precisando de vida. Vamos cuidar dela?', reflection:'Pequenos cuidados fizeram a praça florescer.', action:'Regue as três plantinhas até elas florescerem.' },
  { id:'inclusao', name:'Inclusão', icon:'◉', color:'#e789bd', intro:'Tem gente querendo brincar. Vamos chamar todo mundo?', reflection:'Quando todos têm espaço, a brincadeira fica melhor.', action:'Convide três amigos para brincar com você.' },
  { id:'equipe', name:'Trabalho em equipe', icon:'🤝', color:'#60b8de', intro:'Os brinquedos ficaram espalhados!', reflection:'Viu? Juntos conseguimos!', action:'Ajude a organizar os brinquedos!' },
  { id:'diversao', name:'Diversão', icon:'🎉', color:'#ed7b42', intro:'A festa vai começar! Vamos dançar com as luzes?', reflection:'Brincar, rir e aprender também fazem parte da jornada.', action:'Mova-se até as luzes e feche a mão para dançar.' },
];
const ACHIEVEMENTS = [
  { id:'curioso', icon:'🔎', name:'Olhos curiosos', rule:s=>s.fasesConcluidas.includes('descoberta') },
  { id:'inventor', phaseId:'inovacao', name:'Mãos de inventor', rule:s=>s.fasesConcluidas.includes('inovacao') },
  { id:'cuidador', icon:'🌱', name:'Cuida de todos', rule:s=>s.fasesConcluidas.includes('impacto') },
  { id:'amigo', phaseId:'inclusao', name:'Lugar para todos', rule:s=>s.fasesConcluidas.includes('inclusao') },
  { id:'parceiro', icon:'🤝', name:'Grande parceiro', rule:s=>s.fasesConcluidas.includes('equipe') },
  { id:'festeiro', icon:'🎉', name:'Festa completa', rule:s=>s.fasesConcluidas.length===TOTAL },
];
const OPINION_RECEIVER_URL = 'https://script.google.com/macros/s/AKfycbyZYYr7fx1wQ-u-PCJNRVdGdiGsb8WjCGAn6wPMZ2G4erLUbjZhm5OJyvgpiY5GF2U/exec';
/* Receptor mínimo para Apps Script vinculado à planilha:
function doPost(e) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Opinioes') || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Opinioes');
  if (aba.getLastRow() === 0) aba.appendRow(['Nome/apelido','Idade','Conhecia FIRST','Experiência','Melhoria','Enviado em']);
  const dado = JSON.parse(e.postData.contents);
  aba.appendRow([dado.nome,dado.idade,dado.conheciaFirst,dado.experiencia,dado.melhoria,dado.enviadoEm]);
  return ContentService.createTextOutput('OK');
}
Publique como app da web com acesso permitido ao público e cole a URL /exec acima. Não use chaves secretas no navegador.
*/

function defaultState(){ return { xp:0, fasesConcluidas:[], conquistas:[], somAtivo:true, vozAtiva:true, fundoEscuro:false }; }
function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if(!saved) return defaultState();
    const migrated = defaultState();
    migrated.xp = Number.isFinite(saved.xp) ? saved.xp : 0;
    migrated.somAtivo = saved.somAtivo !== false;
    migrated.vozAtiva = saved.vozAtiva !== false;
    migrated.fundoEscuro = saved.fundoEscuro === true;
    migrated.fasesConcluidas = Array.isArray(saved.fasesConcluidas)
      ? saved.fasesConcluidas.filter(id=>PHASES.some(phase=>phase.id===id))
      : [];
    migrated.conquistas = ACHIEVEMENTS.filter(item=>item.rule(migrated)).map(item=>item.id);
    return migrated;
  }catch(error){ return defaultState(); }
}
let state = loadState();
function saveState(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(error){} }

const screens = [...document.querySelectorAll('.screen')];
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const player = { x:W/2,y:H-105,targetX:W/2,targetY:H-105,r:30 };
let phaseIndex = 0;
let objects = [];
let particles = [];
let gameRunning = false;
let rafId = 0;
let previousTime = 0;
let grabbing = false;
let cameraActive = false;
let handDetected = false;
let mpCamera = null;
let handsModel = null;
let audioCtx = null;
let toastTimer = 0;
let selectedPlank = null;
let selectedToy = null;
let toyHelpers = [];
let teamLiftProgress = 0;
let teamLiftStartedAt = null;
let innovationAnimalProgress = 0;
let innovationAnimalStartedAt = null;
let innovationAnimalCrossed = false;
let beatTimer = 0;
let beatLit = false;
let completedInRound = 0;
let preferredPortugueseVoice = null;
let speechRunId = 0;

function phaseIcon(phase){
  if(phase.id==='inovacao') return '<span class="value-emoji bulb-icon" aria-hidden="true">💡</span>';
  if(phase.id==='inclusao') return '<svg class="value-icon inclusion-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="13" r="6"/><circle cx="10" cy="20" r="4.5"/><circle cx="38" cy="20" r="4.5"/><path d="M13 39v-4a11 11 0 0 1 22 0v4M2 39v-3a8 8 0 0 1 12-7M46 39v-3a8 8 0 0 0-12-7"/></svg>';
  return '<span class="value-emoji" aria-hidden="true">'+phase.icon+'</span>';
}

function applyTheme(){
  document.documentElement.dataset.theme=state.fundoEscuro?'dark':'light';
  document.getElementById('switch-dark-theme').classList.toggle('on',state.fundoEscuro);
  document.getElementById('switch-dark-theme').setAttribute('aria-pressed',String(state.fundoEscuro));
  document.querySelector('meta[name="theme-color"]').content=state.fundoEscuro?'#090909':'#CB070B';
}

function showScreen(name){
  screens.forEach(screen=>screen.classList.toggle('active',screen.id==='screen-'+name));
  document.querySelectorAll('[data-nav]').forEach(button=>button.classList.toggle('active',button.dataset.nav===name));
  window.scrollTo({top:0,behavior:'auto'});
  if(name==='home') renderHome();
  if(name==='map') renderMap();
  if(name==='profile') renderProfile();
  if(name==='achievements') renderAchievements();
}
document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.nav)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.go)));

function showToast(message){
  const toast=document.getElementById('toast');
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);
}
function renderHeader(){
  const count=state.fasesConcluidas.length;
  document.getElementById('header-progress').textContent=count+'/'+TOTAL;
  document.getElementById('header-progress-fill').style.width=(count/TOTAL*100)+'%';
  document.getElementById('header-cam-status').classList.toggle('on',cameraActive);
  document.getElementById('header-camera-label').textContent=cameraActive?'Câmera pronta':'Câmera desligada';
  document.getElementById('settings-camera-status').textContent=cameraActive?'pronta':'desligada';
}
function renderHome(){
  renderHeader();
  const count=state.fasesConcluidas.length;
  document.getElementById('home-progress').textContent=count+' de '+TOTAL+' fases';
  document.getElementById('home-progress-fill').style.width=(count/TOTAL*100)+'%';
  const next=PHASES.find(phase=>!state.fasesConcluidas.includes(phase.id));
  document.getElementById('home-next-icon').innerHTML=next?phaseIcon(next):'<span class="value-emoji" aria-hidden="true">✓</span>';
  document.getElementById('home-next-label').textContent=next?'Continuar jornada':'Ver encerramento';
  document.getElementById('home-continue').dataset.phase=next?next.id:'';
  document.getElementById('home-phase-peek').innerHTML=PHASES.map(phase=>'<div class="peek-item">'+phaseIcon(phase)+'<b>'+phase.name+'</b></div>').join('');
}
document.getElementById('home-continue').addEventListener('click',()=>{
  const id=document.getElementById('home-continue').dataset.phase;
  if(id) openPhase(PHASES.findIndex(phase=>phase.id===id));
  else showScreen('finale');
});

function renderMap(){
  renderHeader();
  const map=document.getElementById('journey-map');
  map.innerHTML='';
  PHASES.forEach((phase,index)=>{
    const done=state.fasesConcluidas.includes(phase.id);
    const unlocked=index<=state.fasesConcluidas.length;
    const button=document.createElement('button');
    button.className='journey-stop'+(done?' done':'')+(unlocked&&!done?' current':'')+(!unlocked?' locked':'');
    button.disabled=!unlocked;
    button.setAttribute('aria-label',phase.name+(done?', concluída':unlocked?', começar':' , bloqueada'));
    button.innerHTML='<span class="stop-art" style="--phase-color:'+phase.color+'">'+phaseIcon(phase)+'</span><span class="stop-info"><b>'+String(index+1).padStart(2,'0')+' · '+phase.name+'</b><small>'+(done?'Concluída':unlocked?'Vamos lá!':'🔒 Continue a jornada')+'</small></span><span class="stop-mark">'+(done?'✓':unlocked?'➜':'🔒')+'</span>';
    if(unlocked) button.addEventListener('click',()=>openPhase(index));
    map.appendChild(button);
  });
}

function openPhase(index){
  phaseIndex=index;
  const phase=PHASES[index];
  document.getElementById('brief-icon').innerHTML=phaseIcon(phase);
  document.getElementById('brief-name').textContent=phase.name;
  document.getElementById('brief-line').textContent=phase.intro;
  document.getElementById('brief-action').textContent=phase.action;
  document.getElementById('brief-number').textContent='FASE '+(index+1)+' DE '+TOTAL;
  document.getElementById('brief-card').style.setProperty('--phase-color',phase.color);
  showScreen('briefing');
  speak(phase.intro+' '+phase.action);
}
document.getElementById('btn-begin').addEventListener('click',()=>startPhase(phaseIndex));
document.getElementById('btn-hear-brief').addEventListener('click',()=>{
  const phase=PHASES[phaseIndex];
  speak(phase.intro+' '+phase.action);
});

function makeObjects(index){
  if(index===0) return [
    {x:155,y:180,emoji:'🪲',found:false},{x:370,y:310,emoji:'🍄',found:false},
    {x:600,y:170,emoji:'🦋',found:false},{x:760,y:330,emoji:'🍓',found:false},
  ];
  if(index===1) return [
    {x:135,y:210,slot:0,placed:false},{x:760,y:425,slot:1,placed:false},
    {x:235,y:400,slot:2,placed:false},{x:725,y:260,slot:3,placed:false},
    {x:150,y:345,slot:4,placed:false},{x:745,y:180,slot:5,placed:false},
    {x:285,y:245,slot:6,placed:false},
  ];
  if(index===2) return [
    {x:250,y:342,emoji:'🌷',water:0,bloom:false},{x:450,y:342,emoji:'🌻',water:0,bloom:false},{x:650,y:342,emoji:'🌼',water:0,bloom:false},
  ];
  if(index===3) return [
    {x:155,y:180,homeX:450,homeY:380,emoji:'🐻',invited:false},{x:730,y:190,homeX:520,homeY:380,emoji:'🐸',invited:false},{x:160,y:390,homeX:380,homeY:385,emoji:'🦊',invited:false},
  ];
  if(index===4) return [
    {x:145,y:365,kind:'bloco',emoji:'🧱',sorted:false,sorting:false},
    {x:320,y:420,kind:'bloco',emoji:'🧩',sorted:false,sorting:false},
    {x:475,y:355,kind:'bola',emoji:'⚽',sorted:false,sorting:false},
    {x:720,y:420,kind:'bola',emoji:'🏀',sorted:false,sorting:false},
    {x:565,y:280,kind:'pelucia',emoji:'🧸',sorted:false,sorting:false},
    {x:805,y:325,kind:'pelucia',emoji:'🐰',sorted:false,sorting:false},
  ];
  return Array.from({length:5},(_,i)=>({x:170+i*140,y:220+(i%2)*80,emoji:['🎵','🎈','🎊','🎵','🎈'][i],hit:false}));
}

function startPhase(index){
  phaseIndex=index;
  objects=makeObjects(index);
  objects.forEach(item=>{item.startX=item.x;item.startY=item.y;});
  particles=[];
  selectedPlank=null;
  selectedToy=null;
  toyHelpers=[
    {kind:'bloco',x:170,y:125,emoji:'🐻',active:false,sorted:0},
    {kind:'bola',x:450,y:125,emoji:'🐰',active:false,sorted:0},
    {kind:'pelucia',x:730,y:125,emoji:'🦊',active:false,sorted:0},
  ];
  teamLiftProgress=0;
  teamLiftStartedAt=null;
  innovationAnimalProgress=0;
  innovationAnimalStartedAt=null;
  innovationAnimalCrossed=false;
  beatTimer=0;
  beatLit=false;
  completedInRound=state.fasesConcluidas.includes(PHASES[index].id)?1:0;
  player.x=player.targetX=W/2;
  player.y=player.targetY=H-105;
  document.getElementById('game-title').textContent=PHASES[index].name;
  document.getElementById('game-goal').textContent=PHASES[index].action;
  document.getElementById('game-prompt').textContent='✋ Mova a mão   ✊ Interaja';
  document.getElementById('game-stage').style.setProperty('--phase-color',PHASES[index].color);
  document.getElementById('cam-panel').classList.toggle('visible',cameraActive);
  document.getElementById('btn-activate-cam').classList.toggle('hidden',cameraActive);
  document.getElementById('overlay-success').classList.remove('visible');
  document.getElementById('success-speaker').hidden=true;
  showScreen('gameplay');
  gameRunning=true;
  previousTime=performance.now();
  cancelAnimationFrame(rafId);
  rafId=requestAnimationFrame(loop);
  renderHeader();
}
document.getElementById('btn-hear-hint').addEventListener('click',()=>speak(PHASES[phaseIndex].action));
document.getElementById('btn-activate-cam').addEventListener('click',activateCamera);

function loop(time){
  if(!gameRunning) return;
  const dt=Math.min(.04,(time-previousTime)/1000);
  previousTime=time;
  update(dt,time);
  drawScene();
  rafId=requestAnimationFrame(loop);
}
function update(dt,time){
  player.x+=(player.targetX-player.x)*Math.min(1,dt*12);
  player.y+=(player.targetY-player.y)*Math.min(1,dt*12);
  if(phaseIndex===1&&selectedPlank){selectedPlank.x=player.x;selectedPlank.y=player.y;}
  if(phaseIndex===4&&selectedToy){selectedToy.x=player.x;selectedToy.y=player.y;}
  if(phaseIndex===2){
    objects.forEach(plant=>{
      if(plant.bloom)return;
      if(grabbing&&distance(player,plant)<86)plant.water=Math.min(.8,plant.water+dt);
      else plant.water=Math.max(0,plant.water-dt*.18);
      if(plant.water>=.8){plant.bloom=true;burst(plant.x,plant.y,'#ffcf55');playSound('correct');checkPhaseProgress();}
    });
  }
  if(phaseIndex===3)objects.forEach(friend=>{
    if(friend.invited){friend.x+=(friend.homeX-friend.x)*Math.min(1,dt*1.8);friend.y+=(friend.homeY-friend.y)*Math.min(1,dt*1.8);}
  });
  if(phaseIndex===4)updateToySorting(dt);
  if(phaseIndex===1&&objects.every(plank=>plank.placed)&&!innovationAnimalCrossed){
    if(innovationAnimalStartedAt===null)innovationAnimalStartedAt=time;
    innovationAnimalProgress=Math.min(1,(time-innovationAnimalStartedAt)/1800);
    if(innovationAnimalProgress>=1){
      innovationAnimalCrossed=true;burst(450,112,'#b7e3a5');playSound('complete');checkPhaseProgress();
    }
  }
  if(phaseIndex===4&&objects.every(toy=>toy.sorted)&&toyHelpers.every(helper=>helper.active&&helper.sorted>=2)){
    if(teamLiftStartedAt===null)teamLiftStartedAt=time;
    teamLiftProgress=Math.min(1,(time-teamLiftStartedAt)/700);
    if(teamLiftProgress>=1)checkPhaseProgress();
  }
  if(phaseIndex===5){beatTimer+=dt;beatLit=beatTimer%1.15<.68;}
  particles=particles.filter(p=>p.life>0);
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});
}
function updateToySorting(dt){
  objects.forEach(toy=>{
    if(!toy.sorting)return;
    toy.sortProgress=Math.min(1,toy.sortProgress+dt*(toy.helper?2.2:3.2));
    toy.x=toy.sortFromX+(toy.binX-toy.sortFromX)*toy.sortProgress;
    toy.y=toy.sortFromY+(toy.binY-toy.sortFromY)*toy.sortProgress;
    if(toy.sortProgress<1)return;
    toy.sorting=false;toy.sorted=true;
    const helper=toyHelpers.find(item=>item.kind===toy.kind);
    helper.sorted++;
    if(!toy.helper){
      helper.active=true;
      const assist=objects.find(item=>item.kind===toy.kind&&!item.sorted&&!item.sorting);
      if(assist){
        assist.helper=true;assist.sorting=true;assist.sortProgress=0;
        assist.sortFromX=assist.x;assist.sortFromY=assist.y;assist.binX=helper.x;assist.binY=238;
      }
    }
    playSound('collect');checkPhaseProgress();
  });
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function closestObject(filter){
  return objects.filter(filter).sort((a,b)=>distance(player,a)-distance(player,b))[0]||null;
}
function performAction(){
  const phase=phaseIndex;
  let target=null;
  if(phase===0){
    target=closestObject(item=>!item.found);
    if(target&&distance(player,target)<90){target.found=true;burst(target.x,target.y,'#fff080');playSound('correct');checkPhaseProgress();}
  }else if(phase===1){
    target=closestObject(item=>!item.placed);
    if(target&&distance(player,target)<92){selectedPlank=target;playSound('collect');}
  }else if(phase===3){
    target=closestObject(friend=>!friend.invited);
    if(target&&distance(player,target)<92){target.invited=true;burst(target.x,target.y,'#ff9acb');playSound('correct');checkPhaseProgress();}
  }else if(phase===4){
    if(!selectedToy){
      target=closestObject(toy=>!toy.sorted&&!toy.sorting);
      if(target&&distance(player,target)<78){selectedToy=target;playSound('collect');}
    }
  }else if(phase===5){
    target=closestObject(item=>!item.hit);
    if(beatLit&&target&&distance(player,target)<105){target.hit=true;completedInRound++;burst(target.x,target.y,'#ffe36e');playSound('correct');checkPhaseProgress();}
    else if(!beatLit){showToast('Espere a luz acender!');}
  }
}
function releaseAction(){
  if(phaseIndex===1&&selectedPlank){
    const plank=selectedPlank;
    plank.x=player.targetX;
    plank.y=player.targetY;
    const slotY=440-plank.slot*43;
    if(Math.hypot(plank.x-450,plank.y-slotY)<58){
      plank.x=450;plank.y=slotY;plank.placed=true;
      burst(450,slotY,'#ffe073');playSound('correct');checkPhaseProgress();
    }else{showToast('Quase! Experimente outro lugar.');}
    selectedPlank=null;
  }
  if(phaseIndex===4&&selectedToy){
    const toy=selectedToy;
    const helper=toyHelpers.find(item=>item.kind===toy.kind);
    if(helper&&Math.hypot(player.targetX-helper.x,player.targetY-238)<92){
      toy.sorting=true;toy.helper=false;toy.sortProgress=0;
      toy.sortFromX=player.targetX;toy.sortFromY=player.targetY;
      toy.binX=helper.x;toy.binY=238;
    }else{
      toy.x=toy.startX;toy.y=toy.startY;
      showToast('Leve ao cesto com o desenho igual.');
    }
    selectedToy=null;
  }
}
function checkPhaseProgress(){
  let complete=false;
  if(phaseIndex===0) complete=objects.every(item=>item.found);
  if(phaseIndex===1) complete=innovationAnimalCrossed;
  if(phaseIndex===2) complete=objects.every(item=>item.bloom);
  if(phaseIndex===3) complete=objects.every(item=>item.invited);
  if(phaseIndex===4) complete=objects.every(toy=>toy.sorted)&&toyHelpers.every(helper=>helper.active&&helper.sorted>=2)&&teamLiftProgress>=1;
  if(phaseIndex===5) complete=objects.every(item=>item.hit);
  const amount=phaseIndex===4?objects.filter(toy=>toy.sorted).length:phaseIndex===1?objects.filter(item=>item.placed).length+(innovationAnimalCrossed?1:0):phaseIndex===5?objects.filter(item=>item.hit).length:objects.filter(item=>item.found||item.placed||item.bloom||item.invited).length;
  const total=phaseIndex===4?objects.length:phaseIndex===1?objects.length+1:objects.length;
  document.getElementById('game-progress').textContent=amount+' / '+total;
  document.getElementById('game-progress-fill').style.width=Math.min(100,amount/total*100)+'%';
  if(complete) finishPhase();
}
function finishPhase(){
  gameRunning=false;
  cancelAnimationFrame(rafId);
  const phase=PHASES[phaseIndex];
  const firstTime=!state.fasesConcluidas.includes(phase.id);
  if(firstTime){state.fasesConcluidas.push(phase.id);state.xp+=50;}
  state.conquistas=ACHIEVEMENTS.filter(item=>item.rule(state)).map(item=>item.id);
  saveState();
  document.getElementById('success-icon').innerHTML=phaseIcon(phase);
  document.getElementById('success-title').textContent='Você conseguiu!';
  document.getElementById('success-speaker').hidden=phase.id!=='equipe'&&phase.id!=='inovacao';
  document.getElementById('success-reflection').textContent=phase.reflection;
  document.getElementById('success-reward').textContent=firstTime?'+50 pontos':'Fase completa';
  document.querySelector('#btn-next-phase span').textContent=state.fasesConcluidas.length===TOTAL?'Ver celebração':'Próxima aventura';
  document.getElementById('overlay-success').classList.add('visible');
  playSound('complete');
  speak(phase.reflection);
  renderHeader();
}
document.getElementById('btn-next-phase').addEventListener('click',()=>{
  document.getElementById('overlay-success').classList.remove('visible');
  const next=PHASES.findIndex(phase=>!state.fasesConcluidas.includes(phase.id));
  if(next===-1) showScreen('finale');
  else openPhase(next);
});
document.getElementById('btn-game-map').addEventListener('click',()=>{gameRunning=false;cancelAnimationFrame(rafId);showScreen('map');});

function drawScene(){
  const palette=[
    ['#83d9bd','#d6f1a0','#277960'],['#9dddf0','#f5d17a','#72b6c4'],
    ['#b8e989','#e6f4ad','#54943c'],['#ffc3dc','#e6c9f4','#a15f9b'],
    ['#a9e8f3','#d6f4fc','#477e9b'],['#ffcb82','#ff9ab5','#9a4c78'],
  ][phaseIndex];
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,palette[0]);sky.addColorStop(1,palette[1]);
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  if(phaseIndex!==1&&phaseIndex!==2){ctx.fillStyle=palette[2];ctx.beginPath();ctx.ellipse(W/2,H+120,650,230,0,0,Math.PI*2);ctx.fill();}
  drawSun();
  if(phaseIndex===0) drawDiscovery();
  if(phaseIndex===1) drawInnovation();
  if(phaseIndex===2) drawImpact();
  if(phaseIndex===3) drawInclusion();
  if(phaseIndex===4) drawTeamwork();
  if(phaseIndex===5) drawFun();
  drawMascot();
  drawProgress();
  drawParticles();
}
function drawSun(){ctx.fillStyle='#fff5a5';ctx.beginPath();ctx.arc(805,78,35,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.22)';ctx.beginPath();ctx.arc(805,78,50,0,Math.PI*2);ctx.fill();}
function drawDiscovery(){
  for(let i=0;i<7;i++){const x=45+i*135;drawEmoji(i%2?'🌳':'🌲',x,260+(i%3)*25,82);}
  objects.forEach(item=>{if(!item.found){ctx.fillStyle='#328b62';ctx.beginPath();ctx.ellipse(item.x,item.y+18,40,25,0,0,Math.PI*2);ctx.fill();}else drawEmoji(item.emoji,item.x,item.y,45);});
}
function drawInnovation(){
  ctx.fillStyle='#77bd73';ctx.fillRect(0,0,W,135);ctx.fillRect(0,485,W,55);
  ctx.fillStyle='#53b9d5';ctx.fillRect(0,135,W,350);
  for(let row=0;row<4;row++){
    ctx.strokeStyle='rgba(255,255,255,.42)';ctx.lineWidth=3;
    for(let col=0;col<5;col++){
      const x=55+col*190+(row%2)*55;
      const y=165+row*82;
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+24,y-9,x+48,y);ctx.stroke();
    }
  }
  drawEmoji('🏡',450,65,48);
  const slotYs=Array.from({length:7},(_,slot)=>440-slot*43);
  if(selectedPlank){
    const targetY=slotYs[selectedPlank.slot];
    ctx.save();ctx.setLineDash([6,5]);ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=3;
    ctx.strokeRect(394,targetY-23,112,46);ctx.restore();
  }
  objects.filter(plank=>plank.placed).forEach(plank=>drawPlank(450,slotYs[plank.slot],true));
  objects.forEach(plank=>{
    if(plank.placed)return;
    drawPlank(plank.x,plank.y,plank===selectedPlank);
  });
  drawEmoji('🐰',450,485-innovationAnimalProgress*420,48);
  if(innovationAnimalCrossed){
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.roundRect(330,112,240,42,14);ctx.fill();
    ctx.fillStyle='#255b45';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('CHEGOU!',450,139);
  }
}
function drawImpact(){
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#68c8ef');sky.addColorStop(.64,'#bceaf7');sky.addColorStop(.65,'#82bf65');sky.addColorStop(1,'#57964d');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#74b957';ctx.fillRect(0,350,W,190);
  ctx.fillStyle='#a9cf72';ctx.beginPath();ctx.ellipse(450,355,560,36,0,0,Math.PI*2);ctx.fill();
  objects.forEach(plant=>{
    ctx.fillStyle='#986d44';ctx.beginPath();ctx.ellipse(plant.x,420,43,11,0,0,Math.PI*2);ctx.fill();
    const stemHeight=plant.bloom?82:22+plant.water*58;
    const stemTop=420-stemHeight;
    ctx.strokeStyle='#397f43';ctx.lineWidth=8;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(plant.x,420);ctx.lineTo(plant.x,stemTop);ctx.stroke();
    ctx.fillStyle='#4e984c';ctx.beginPath();ctx.ellipse(plant.x-13,stemTop+stemHeight*.56,15,7,-.55,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(plant.x+13,stemTop+stemHeight*.76,15,7,.55,0,Math.PI*2);ctx.fill();
    if(plant.bloom)drawEmoji(plant.emoji,plant.x,stemTop-22,55);
    else{
      drawEmoji('🌱',plant.x,stemTop-9,26);
      ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(plant.x,365,27,-Math.PI/2,-Math.PI/2+Math.PI*2*plant.water/.8);ctx.stroke();
    }
  });
  ctx.lineCap='butt';
}
function drawInclusion(){
  ctx.fillStyle='#f9e5a5';ctx.beginPath();ctx.ellipse(450,380,240,95,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff7d7';ctx.beginPath();ctx.ellipse(450,367,184,57,0,0,Math.PI*2);ctx.fill();
  drawEmoji('🧸',413,362,43);drawEmoji('⚽',463,369,34);drawEmoji('🧱',493,348,29);
  objects.forEach(friend=>{drawEmoji(friend.emoji,friend.x,friend.y,48);if(friend.invited)drawEmoji('💛',friend.x,friend.y-34,24);});
}
function drawTeamwork(){
  ctx.fillStyle='#efd7b5';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#d6b58d';ctx.fillRect(0,445,W,95);
  ctx.fillStyle='#d8c5aa';ctx.beginPath();ctx.roundRect(70,255,760,185,24);ctx.fill();
  const helpers=toyHelpers;
  helpers.forEach(helper=>{
    drawEmoji(helper.emoji,helper.x,helper.y+(helper.active?Math.sin(performance.now()/150)*3:0),53);
    drawBasket(helper.x,238,helper.kind,helper.sorted);
    if(helper.active){ctx.fillStyle='#CB070B';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText('✓',helper.x+42,helper.y-26);}
  });
  objects.forEach(toy=>{
    if(toy.sorted){
      const helper=helpers.find(item=>item.kind===toy.kind);
      const sortedBefore=objects.filter(item=>item.kind===toy.kind&&item.sorted).indexOf(toy);
      drawEmoji(toy.emoji,helper.x-19+sortedBefore*38,240,24);
    }else{
      drawEmoji(toy.emoji,toy.x,toy.y,toy===selectedToy?42:36);
    }
  });
  if(teamLiftProgress>=.35){
    ctx.fillStyle='rgba(255,255,255,.92)';ctx.beginPath();ctx.roundRect(327,54,246,36,13);ctx.fill();
    ctx.fillStyle='#255b45';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('TODO MUNDO AJUDOU!',450,78);
  }
}
function drawPlank(x,y,active){
  ctx.fillStyle=active?'#eeb65c':'#b87943';ctx.strokeStyle='#70442d';ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(x-54,y-21,108,42,5);ctx.fill();ctx.stroke();
  ctx.strokeStyle='rgba(255,236,195,.65)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x-39,y-11);ctx.lineTo(x+36,y-11);ctx.moveTo(x-39,y);ctx.lineTo(x+36,y);ctx.moveTo(x-39,y+11);ctx.lineTo(x+36,y+11);ctx.stroke();
}
function drawBasket(x,y,kind,count){
  const color=kind==='bloco'?'#CB070B':kind==='bola'?'#55a5c5':'#ba7d3f';
  ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(x-62,y-21,124,58,10);ctx.fill();
  ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(x-62,y-21,124,58,10);ctx.stroke();
  ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y-20,38,Math.PI,Math.PI*2);ctx.stroke();
  drawEmoji(kind==='bloco'?'🧱':kind==='bola'?'⚽':'🧸',x,y-3,27);
  ctx.fillStyle=color;ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(count+'/2',x,y+30);
}
function drawFun(){
  ctx.fillStyle='rgba(255,255,255,.32)';ctx.beginPath();ctx.ellipse(450,465,340,55,0,0,Math.PI*2);ctx.fill();
  objects.forEach(item=>{
    ctx.beginPath();ctx.arc(item.x,item.y,48,0,Math.PI*2);
    ctx.fillStyle=item.hit?'rgba(255,255,255,.45)':beatLit?'rgba(255,246,142,.72)':'rgba(255,255,255,.24)';ctx.fill();
    if(!item.hit&&beatLit){ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.stroke();}
    if(!item.hit)drawEmoji(item.emoji,item.x,item.y,32);
  });
  ['🎈','🎊','🎈','🎊','🎈'].forEach((item,index)=>drawEmoji(item,80+index*180,115+(index%2)*50,38));
  ctx.fillStyle='#fff';ctx.font='bold 18px Questrial, sans-serif';ctx.textAlign='center';ctx.fillText(beatLit?'LUZ ACESA!':'PREPARE-SE!',450,290);
}
function drawProgress(){
  if(phaseIndex===0) document.getElementById('game-progress').textContent=objects.filter(item=>item.found).length+' / 4';
  if(phaseIndex===1) document.getElementById('game-progress').textContent=(objects.filter(item=>item.placed).length+(innovationAnimalCrossed?1:0))+' / 8';
  if(phaseIndex===2) document.getElementById('game-progress').textContent=objects.filter(item=>item.bloom).length+' / 3';
  if(phaseIndex===3) document.getElementById('game-progress').textContent=objects.filter(item=>item.invited).length+' / 3';
  if(phaseIndex===4) document.getElementById('game-progress').textContent=objects.filter(toy=>toy.sorted).length+' / 6';
  if(phaseIndex===5) document.getElementById('game-progress').textContent=objects.filter(item=>item.hit).length+' / 5';
  const amounts=[objects.filter(i=>i.found).length/4,(objects.filter(i=>i.placed).length+innovationAnimalProgress)/8,objects.filter(i=>i.bloom).length/3,objects.filter(i=>i.invited).length/3,objects.filter(toy=>toy.sorted).length/6,objects.filter(i=>i.hit).length/5];
  document.getElementById('game-progress-fill').style.width=(amounts[phaseIndex]*100)+'%';
}
function drawMascot(){
  ctx.save();ctx.shadowColor='rgba(32,58,40,.25)';ctx.shadowBlur=16;
  ctx.fillStyle=grabbing?'#ffb3a8':'#CB070B';ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(player.x-9,player.y-5,6,0,Math.PI*2);ctx.arc(player.x+9,player.y-5,6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#342222';ctx.beginPath();ctx.arc(player.x-8,player.y-5,2.5,0,Math.PI*2);ctx.arc(player.x+10,player.y-5,2.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#342222';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(player.x,player.y+3,8,.15,Math.PI-.15);ctx.stroke();
  if(!cameraActive){ctx.strokeStyle='rgba(203,7,11,.35)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(player.x,player.y,player.r+7,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}
function drawEmoji(emoji,x,y,size){ctx.font=size+'px "Segoe UI Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emoji,x,y);}
function drawParticles(){particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}
function burst(x,y,color){for(let i=0;i<18;i++)particles.push({x,y,vx:(Math.random()-.5)*210,vy:(Math.random()-.65)*190,life:.8,size:3+Math.random()*5,color});}

function setPlayerFromClient(x,y){
  const rect=canvas.getBoundingClientRect();
  player.targetX=Math.max(30,Math.min(W-30,(x-rect.left)*W/rect.width));
  player.targetY=Math.max(60,Math.min(H-32,(y-rect.top)*H/rect.height));
}
function setGrabbing(value){
  if(grabbing===value)return;
  grabbing=value;
  document.querySelector('#gesture-flag .gi').textContent=value?'✊':'✋';
  document.getElementById('gesture-text').textContent=value?'Interagir':'Mover a mão';
  if(value)performAction();
  else releaseAction();
}
canvas.addEventListener('pointermove',event=>{if(!cameraActive)setPlayerFromClient(event.clientX,event.clientY);});
canvas.addEventListener('pointerdown',event=>{if(!cameraActive){canvas.setPointerCapture(event.pointerId);setPlayerFromClient(event.clientX,event.clientY);player.x=player.targetX;player.y=player.targetY;setGrabbing(true);}});
canvas.addEventListener('pointerup',()=>{if(!cameraActive)setGrabbing(false);});
canvas.addEventListener('pointercancel',()=>setGrabbing(false));
document.addEventListener('keydown',event=>{
  if(event.code==='Space'&&gameRunning){event.preventDefault();setGrabbing(true);}
  if(event.code==='Escape'&&gameRunning){setGrabbing(false);gameRunning=false;cancelAnimationFrame(rafId);showScreen('map');}
});
document.addEventListener('keyup',event=>{if(event.code==='Space')setGrabbing(false);});

function landmarkDist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function isFist(landmarks){
  const wrist=landmarks[0];const tips=[8,12,16,20];const pips=[6,10,14,18];
  let curled=0;
  for(let i=0;i<tips.length;i++)if(landmarkDist(landmarks[tips[i]],wrist)<landmarkDist(landmarks[pips[i]],wrist))curled++;
  return curled>=3;
}
function initMediaPipe(){
  if(handsModel)return handsModel;
  handsModel=new Hands({locateFile:file=>'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'+file});
  handsModel.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:.7,minTrackingConfidence:.6});
  handsModel.onResults(onHandResults);
  return handsModel;
}
function onHandResults(results){
  const preview=document.getElementById('cam-preview');
  const previewCtx=preview.getContext('2d');
  previewCtx.save();previewCtx.clearRect(0,0,preview.width,preview.height);
  if(results.image)previewCtx.drawImage(results.image,0,0,preview.width,preview.height);
  const foot=document.getElementById('cam-foot');
  if(results.multiHandLandmarks&&results.multiHandLandmarks.length){
    handDetected=true;foot.classList.add('detected');
    const marks=results.multiHandLandmarks[0];
    if(window.drawConnectors&&window.HAND_CONNECTIONS)window.drawConnectors(previewCtx,marks,window.HAND_CONNECTIONS,{color:'#CB070B',lineWidth:2});
    if(window.drawLandmarks)window.drawLandmarks(previewCtx,marks,{color:'#ffffff',radius:2});
    const palm=marks[9];
    player.targetX=60+(1-palm.x)*(W-120);
    player.targetY=H*.18+palm.y*(H*.72);
    setGrabbing(isFist(marks));
  }else{
    handDetected=false;foot.classList.remove('detected');setGrabbing(false);
  }
  previewCtx.restore();
}
async function activateCamera(){
  if(cameraActive)return;
  try{
    initMediaPipe();
    const video=document.getElementById('input-video');
    mpCamera=new Camera(video,{onFrame:async()=>{await handsModel.send({image:video});},width:320,height:240});
    await mpCamera.start();
    cameraActive=true;
    document.getElementById('cam-panel').classList.add('visible');
    document.getElementById('btn-activate-cam').classList.add('hidden');
    renderHeader();
    showToast('Câmera pronta! Mão aberta move, punho interage.');
    playSound('correct');
  }catch(error){showToast('Câmera indisponível. Use o toque ou o mouse.');}
}

function ensureAudio(){
  if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(error){return null;}}
  if(audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}
function playSound(kind){
  if(!state.somAtivo)return;
  const audio=ensureAudio();if(!audio)return;
  const notes=kind==='wrong'?[190]:kind==='collect'?[520]:kind==='unlock'?[500,700,920]:kind==='complete'?[480,640,840]:[660,880];
  notes.forEach((frequency,index)=>{
    const oscillator=audio.createOscillator();const gain=audio.createGain();
    oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.value=.045;
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(audio.currentTime+index*.09);
    gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+index*.09+.16);oscillator.stop(audio.currentTime+index*.09+.17);
  });
}
function speak(text){
  if(!state.vozAtiva||!('speechSynthesis'in window)){showToast('A voz não está disponível neste aparelho.');return;}
  window.speechSynthesis.cancel();
  choosePortugueseVoice();
  const speech=new SpeechSynthesisUtterance(text.replace(/\s+/g,' ').trim());
  speech.lang='pt-BR';speech.rate=.87;speech.pitch=1.07;speech.volume=1;
  if(preferredPortugueseVoice)speech.voice=preferredPortugueseVoice;
  window.speechSynthesis.speak(speech);
}
document.getElementById('btn-settings').addEventListener('click',()=>{
  const modal=document.getElementById('modal-settings');
  modal.classList.add('active');
  document.getElementById('switch-sound').classList.toggle('on',state.somAtivo);
  document.getElementById('switch-voice').classList.toggle('on',state.vozAtiva);
  document.getElementById('switch-dark-theme').classList.toggle('on',state.fundoEscuro);
});
document.getElementById('btn-close-settings').addEventListener('click',()=>document.getElementById('modal-settings').classList.remove('active'));
document.getElementById('modal-settings').addEventListener('click',event=>{if(event.target.id==='modal-settings')event.currentTarget.classList.remove('active');});
document.getElementById('switch-sound').addEventListener('click',event=>{state.somAtivo=!state.somAtivo;event.currentTarget.classList.toggle('on',state.somAtivo);saveState();});
document.getElementById('switch-voice').addEventListener('click',event=>{state.vozAtiva=!state.vozAtiva;event.currentTarget.classList.toggle('on',state.vozAtiva);saveState();});
document.getElementById('switch-dark-theme').addEventListener('click',event=>{state.fundoEscuro=!state.fundoEscuro;event.currentTarget.classList.toggle('on',state.fundoEscuro);applyTheme();saveState();});

function renderAchievements(){
  const list=document.getElementById('achievement-list');list.innerHTML='';
  ACHIEVEMENTS.forEach(item=>{
    const unlocked=state.conquistas.includes(item.id);
    const badge=document.createElement('div');badge.className='achievement'+(unlocked?' earned':'');
    const icon=item.phaseId?phaseIcon(PHASES.find(phase=>phase.id===item.phaseId)):'<span class="value-emoji" aria-hidden="true">'+item.icon+'</span>';
    badge.innerHTML=icon+'<b>'+item.name+'</b><small>'+(unlocked?'Conquista recebida':'Continue a jornada')+'</small>';
    list.appendChild(badge);
  });
}
function renderProfile(){
  renderHeader();
  document.getElementById('profile-progress').textContent=state.fasesConcluidas.length+' de '+TOTAL+' fases';
  document.getElementById('profile-points').textContent=state.xp;
  document.getElementById('profile-progress-fill').style.width=(state.fasesConcluidas.length/TOTAL*100)+'%';
}
document.getElementById('btn-reset').addEventListener('click',()=>{
  if(!confirm('Apagar seu progresso e começar de novo?'))return;
  state=defaultState();saveState();showScreen('home');showToast('Jornada recomeçada!');
});

document.getElementById('btn-finale-replay').addEventListener('click',()=>showScreen('map'));
document.getElementById('btn-finale-restart').addEventListener('click',()=>{
  if(!confirm('Reiniciar a jornada e apagar o progresso das fases?'))return;
  state.xp=0;
  state.fasesConcluidas=[];
  state.conquistas=[];
  saveState();
  showScreen('home');
  showToast('A jornada recomeçou!');
});
document.getElementById('btn-opinion').addEventListener('click',()=>{
  document.getElementById('opinion-status').textContent='';
  document.getElementById('modal-opinion').classList.add('active');
});
document.getElementById('btn-close-opinion').addEventListener('click',()=>document.getElementById('modal-opinion').classList.remove('active'));
document.getElementById('modal-opinion').addEventListener('click',event=>{
  if(event.target.id==='modal-opinion')event.currentTarget.classList.remove('active');
});
document.getElementById('opinion-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const status=document.getElementById('opinion-status');
  const formData=new FormData(form);
  const opinion={
    nome:(formData.get('nome')||'').toString().trim(),
    idade:(formData.get('idade')||'').toString(),
    conheciaFirst:(formData.get('conheciaFirst')||'').toString(),
    experiencia:(formData.get('experiencia')||'').toString(),
    melhoria:(formData.get('melhoria')||'').toString().trim(),
    enviadoEm:new Date().toISOString(),
  };
  if(!OPINION_RECEIVER_URL){
    status.textContent='O envio ainda não está conectado. Configure OPINION_RECEIVER_URL no codecore.js.';
    return;
  }
  status.textContent='Enviando…';
  try{
    await fetch(OPINION_RECEIVER_URL,{
      method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(opinion)
    });
    status.textContent='Obrigado por contar pra gente!';
    form.reset();
  }catch(error){status.textContent='Não foi possível enviar agora. Tente novamente mais tarde.';}
});

function boot(){
  applyTheme();
  renderHeader();renderHome();
  setTimeout(()=>{document.getElementById('screen-splash').classList.remove('active');document.getElementById('app-shell').classList.add('ready');showScreen('home');},900);
}

function choosePortugueseVoice(){
  if(!('speechSynthesis'in window))return;
  const voices=window.speechSynthesis.getVoices();
  const portuguese=voices.filter(voice=>voice.lang.toLowerCase().startsWith('pt-br'));
  preferredPortugueseVoice=portuguese.find(voice=>/maria|francisca|luciana|natural|neural|google/i.test(voice.name))||portuguese.find(voice=>!voice.localService)||portuguese[0]||null;
}
if('speechSynthesis'in window){choosePortugueseVoice();window.speechSynthesis.onvoiceschanged=choosePortugueseVoice;}
boot();
})();