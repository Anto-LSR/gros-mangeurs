// une ligne par personne : photo + nom affiché
const PEOPLE = [
  { img: '1.png', name: 'Margaux' },
  { img: '2.jpg', name: 'Marine' },
  { img: '3.jpg', name: 'Léo' },
  { img: '4.png', name: 'Hugo' },
  { img: '5.png', name: 'Romain' },
  { img: '6.png', name: 'Mathilde' },
  { img: '7.png', name: 'Coline' },
  { img: '8.png', name: 'Sidonie' },
  { img: '9.png', name: 'Antonin' },
  { img: '10.png', name: 'Jules' },
  { img: '11.png', name: 'Julien' },
];
const IMAGES = PEOPLE.map(p => p.img);
const NAMES = PEOPLE.map(p => p.name);
const WORLD = 4000;
const MOBILE = matchMedia('(pointer: coarse)').matches;
const BOTS = 22;
const FOOD = 400;
const FOOD_COLORS = ['#e84a5f', '#ffd166', '#06d6a0', '#118ab2', '#ff8fab', '#9b5de5'];
const EAT_LINES = ['MIAM', 'SLURP', 'CROUNCH', 'GLOUPS', 'BURP', 'NOM NOM', 'HOP', 'ADIEU'];
const DEATH_LINES = [
  "s'est fait gober par",
  'a fini dans le ventre de',
  'a servi de goûter à',
  "n'a pas fait le poids face à",
  'a été aspiré(e) par',
];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const board = document.getElementById('board');
const imgs = IMAGES.map(src => { const i = new Image(); i.src = 'img/' + src; return i; });

let W, H, DPR, player, bots, food, popups, mouse, cam, shake, running, startTime;

function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}
addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const radius = mass => Math.sqrt(mass) * 4;
// un peu plus lent sur mobile, c'est moins précis au doigt
const SPEED_FACTOR = MOBILE ? 0.85 : 1;
const speed = mass => Math.max(1.2, 7 - Math.log(mass) * 0.9) * SPEED_FACTOR;

function makeBlob(face, mass, isPlayer = false) {
  return { face, mass, x: rand(100, WORLD - 100), y: rand(100, WORLD - 100), vx: 0, vy: 0, isPlayer, wob: rand(0, 6), target: null, alive: true };
}

function makeFood() {
  return { x: rand(0, WORLD), y: rand(0, WORLD), c: pick(FOOD_COLORS) };
}

function spawnBot() {
  const others = IMAGES.map((_, i) => i).filter(i => i !== player.face);
  const b = makeBlob(pick(others), rand(8, Math.max(40, player.mass * 1.6)));
  // pas de spawn sur la tête du joueur
  while (Math.hypot(b.x - player.x, b.y - player.y) < 600) { b.x = rand(100, WORLD - 100); b.y = rand(100, WORLD - 100); }
  return b;
}

function start(face) {
  player = makeBlob(face, 15, true);
  player.x = player.y = WORLD / 2;
  bots = [];
  for (let i = 0; i < BOTS; i++) bots.push(spawnBot());
  food = Array.from({ length: FOOD }, makeFood);
  popups = [];
  mouse = { x: W / 2, y: H / 2 };
  joy = null;
  cam = { x: player.x, y: player.y, zoom: 1.2 };
  shake = 0;
  startTime = performance.now();
  running = true;
  document.getElementById('start').classList.add('hidden');
  document.getElementById('over').classList.add('hidden');
}

function moveToward(b, tx, ty, factor = 1) {
  const dx = tx - b.x, dy = ty - b.y;
  const d = Math.hypot(dx, dy) || 1;
  const s = speed(b.mass) * factor * Math.min(1, d / 60);
  b.vx += (dx / d * s - b.vx) * 0.2;
  b.vy += (dy / d * s - b.vy) * 0.2;
}

function botBrain(b) {
  const r = radius(b.mass);
  let threat = null, prey = null, bestThreat = 400 + r, bestPrey = 500 + r;
  for (const o of [player, ...bots]) {
    if (o === b || !o.alive) continue;
    const d = Math.hypot(o.x - b.x, o.y - b.y);
    if (o.mass > b.mass * 1.15 && d < bestThreat) { threat = o; bestThreat = d; }
    else if (b.mass > o.mass * 1.15 && d < bestPrey) { prey = o; bestPrey = d; }
  }
  if (threat) {
    moveToward(b, b.x * 2 - threat.x, b.y * 2 - threat.y, 1);
  } else if (prey) {
    moveToward(b, prey.x, prey.y, 0.9);
  } else {
    if (!b.target || Math.hypot(b.target.x - b.x, b.target.y - b.y) < 50 || Math.random() < 0.005) {
      b.target = { x: rand(0, WORLD), y: rand(0, WORLD) };
    }
    moveToward(b, b.target.x, b.target.y, 0.6);
  }
}

function eat(eater, victim) {
  eater.mass += victim.mass * 0.8;
  victim.alive = false;
  const onScreen = eater.isPlayer || victim.isPlayer || Math.hypot(eater.x - player.x, eater.y - player.y) < 900;
  if (onScreen) {
    popups.push({ x: victim.x, y: victim.y, t: 60, text: pick(EAT_LINES) + ' !', size: 20 + radius(eater.mass) * 0.3 });
    if (eater.isPlayer) shake = 12;
  }
  if (victim.isPlayer) gameOver(eater);
}

function update() {
  // joueur suit la souris
  if (joy) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 4) moveToward(player, player.x + dx / d * 100, player.y + dy / d * 100, Math.min(1, d / JOY_MAX));
    else { player.vx *= 0.8; player.vy *= 0.8; }
  } else if (!MOBILE) {
    const wx = cam.x + (mouse.x - W / 2) / cam.zoom;
    const wy = cam.y + (mouse.y - H / 2) / cam.zoom;
    moveToward(player, wx, wy, 1);
  } else { player.vx *= 0.9; player.vy *= 0.9; }

  for (const b of bots) botBrain(b);

  const all = [player, ...bots];
  for (const b of all) {
    b.x = Math.max(0, Math.min(WORLD, b.x + b.vx));
    b.y = Math.max(0, Math.min(WORLD, b.y + b.vy));
    b.wob += 0.15;
    // petite perte de masse pour les gros, sinon ça devient n'importe quoi
    if (b.mass > 200) b.mass *= 0.9998;
  }

  // nourriture
  for (const b of all) {
    const r = radius(b.mass);
    for (const f of food) {
      if (f.eaten) continue;
      if (Math.abs(f.x - b.x) < r && Math.abs(f.y - b.y) < r && Math.hypot(f.x - b.x, f.y - b.y) < r) {
        b.mass += 1;
        f.eaten = true;
      }
    }
  }
  food = food.filter(f => !f.eaten);
  while (food.length < FOOD) food.push(makeFood());

  // qui mange qui
  for (let i = 0; i < all.length; i++) {
    for (let j = 0; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a === b || !a.alive || !b.alive) continue;
      if (a.mass > b.mass * 1.15 && Math.hypot(a.x - b.x, a.y - b.y) < radius(a.mass) - radius(b.mass) * 0.4) eat(a, b);
    }
  }

  bots = bots.filter(b => b.alive);
  while (running && bots.length < BOTS) bots.push(spawnBot());

  // caméra
  cam.x += (player.x - cam.x) * 0.1;
  cam.y += (player.y - cam.y) * 0.1;
  // on dézoome quand on grossit ; sur petit écran on zoome un peu plus pour bien voir les têtes
  const base = Math.min(2, Math.max(1, 650 / Math.min(W, H)));
  const targetZoom = Math.max(0.2, base * Math.min(1, 45 / radius(player.mass)));
  cam.zoom += (targetZoom - cam.zoom) * 0.03;

  for (const p of popups) { p.t--; p.y -= 1; }
  popups = popups.filter(p => p.t > 0);
  shake *= 0.85;
}

function drawBlob(b) {
  const r = radius(b.mass);
  const sq = 1 + Math.sin(b.wob) * 0.04;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.scale(sq, 2 - sq);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  const img = imgs[b.face];
  if (img.complete && img.naturalWidth) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, -r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#ccc';
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r * 0.08);
  ctx.strokeStyle = b.isPlayer ? '#ffd166' : (b.mass > player.mass * 1.15 ? '#e84a5f' : b.mass * 1.15 < player.mass ? '#06d6a0' : '#2a363b');
  ctx.stroke();
  ctx.restore();
  // nom sous la tête, taille de texte lisible quel que soit le zoom
  const fs = Math.max(12 / cam.zoom, r * 0.35);
  ctx.font = `bold ${fs}px "Comic Sans MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = fs * 0.25;
  ctx.strokeStyle = '#fdf6ec';
  ctx.fillStyle = '#2a363b';
  const label = NAMES[b.face] + (b.isPlayer ? ' (toi)' : '');
  ctx.strokeText(label, b.x, b.y + r + fs * 0.2);
  ctx.fillText(label, b.x, b.y + r + fs * 0.2);
  ctx.textBaseline = 'alphabetic';
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#fdf6ec';
  ctx.fillRect(0, 0, W, H);

  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  const z = cam.zoom * DPR;
  ctx.setTransform(z, 0, 0, z, (W / 2 + sx) * DPR - cam.x * z, (H / 2 + sy) * DPR - cam.y * z);

  // grille
  ctx.strokeStyle = 'rgba(42,54,59,.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let g = 0; g <= WORLD; g += 100) { ctx.moveTo(g, 0); ctx.lineTo(g, WORLD); ctx.moveTo(0, g); ctx.lineTo(WORLD, g); }
  ctx.stroke();
  ctx.strokeStyle = '#e84a5f';
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, WORLD, WORLD);

  for (const f of food) {
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const all = [...bots, player].filter(b => b.alive).sort((a, b) => a.mass - b.mass);
  for (const b of all) drawBlob(b);

  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = p.t / 60;
    ctx.font = `bold ${p.size}px "Comic Sans MS", sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2a363b';
    ctx.fillStyle = '#ffd166';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  hud.textContent = `Taille : ${Math.floor(player.mass)}`;
  const ranking = [player, ...bots].filter(b => b.alive).sort((a, b) => b.mass - a.mass);
  const rank = ranking.indexOf(player) + 1;
  board.innerHTML = '<b>Les plus gros</b><br>' + ranking.slice(0, 5).map((b, i) =>
    `${i + 1}. ${b.isPlayer ? '<b>TOI</b>' : NAMES[b.face]} — ${Math.floor(b.mass)}`
  ).join('<br>') + (rank > 5 ? `<br>…<br>${rank}. <b>TOI</b>` : '');
}

function gameOver(killer) {
  running = false;
  const secs = Math.floor((performance.now() - startTime) / 1000);
  document.getElementById('deadFace').src = 'img/' + IMAGES[killer.face];
  document.getElementById('overTitle').textContent = pick(['MIAM.', 'GLOUPS.', 'AÏE.', 'BURP.']);
  document.getElementById('overText').textContent =
    `Tu ${pick(DEATH_LINES)} ${NAMES[killer.face]}. Taille max : ${Math.floor(player.maxMass)}, survie : ${secs} s.`;
  setTimeout(() => document.getElementById('over').classList.remove('hidden'), 600);
}

function loop() {
  if (player) {
    if (running) {
      update();
      player.maxMass = Math.max(player.maxMass || 0, player.mass);
    }
    draw();
    if (running) drawJoystick();
  }
  requestAnimationFrame(loop);
}

// contrôles souris
addEventListener('mousemove', e => { if (mouse) { mouse.x = e.clientX; mouse.y = e.clientY; } });

// contrôles tactiles : joystick virtuel (on pose le doigt n'importe où et on glisse)
let joy = null;
const JOY_MAX = 60;
function joyMove(t) {
  let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
  const d = Math.hypot(dx, dy);
  // la base du joystick suit le doigt s'il va trop loin
  if (d > JOY_MAX) { joy.ox += dx * (1 - JOY_MAX / d); joy.oy += dy * (1 - JOY_MAX / d); }
  joy.x = t.clientX; joy.y = t.clientY;
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!mouse) return;
  const t = e.changedTouches[0];
  joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
  joyMove(t);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!joy) return;
  for (const t of e.changedTouches) if (t.identifier === joy.id) joyMove(t);
}, { passive: false });
const joyEnd = e => {
  if (!joy) return;
  for (const t of e.changedTouches) if (t.identifier === joy.id) {
    joy = null;
    player.vx = player.vy = 0;
  }
};
canvas.addEventListener('touchend', joyEnd);
canvas.addEventListener('touchcancel', joyEnd);

function drawJoystick() {
  if (!joy) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#2a363b';
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JOY_MAX, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffd166';
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
  ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 26, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

// écran de choix
const picker = document.getElementById('picker');
PEOPLE.forEach((p, i) => {
  const el = document.createElement('figure');
  el.innerHTML = `<img src="img/${p.img}" alt=""><figcaption></figcaption>`;
  el.querySelector('figcaption').textContent = p.name;
  el.onclick = () => start(i);
  picker.appendChild(el);
});
document.getElementById('again').onclick = () => {
  document.getElementById('over').classList.add('hidden');
  document.getElementById('start').classList.remove('hidden');
};

loop();
