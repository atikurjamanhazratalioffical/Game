(function () {

  // ── CANVAS SETUP ──
  const canvas  = document.getElementById('game-canvas');
  const ctx     = canvas.getContext('2d');
  const sCanvas = document.getElementById('speedo-canvas');
  const sCtx    = sCanvas.getContext('2d');

  // ── STATE ──
  let power = 0, taps = 0, maxSpeed = 0, bestTps = 0;
  let gameActive = false, gameStarted = false;
  let timeLeft = 30, gameDuration = 30;
  let timerInterval = null, timerPaused = false;
  let roadOffset = 0;
  let carShake = { x: 0, y: 0 };
  let particles = [];
  let tapTimes = [];
  let animId = null, lastFrameTime = 0;
  let bgStars = [];
  let shakeTimer = 0;
  let displaySpeed = 0;
  let rearWheelWorld = { x: 0, y: 0 };

  // Moon (fixed position, size set on resize)
  const moon = { x: 0.78, y: 0.18, r: 0, glowPhase: 0 };

  // ── DOM REFS ──
  const timerDisplay = document.getElementById('timer-display');
  const powerFill    = document.getElementById('power-fill');
  const tapsVal      = document.getElementById('taps-val');
  const pressBtn     = document.getElementById('press-btn');
  const tapFlash     = document.getElementById('tap-flash');

  // ── CANVAS RESIZE ──
  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = r.width  * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    generateStars(r.width, r.height);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function getCanvasSize() {
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  // ── STARS & MOON SIZE ──
  function generateStars(w, h) {
    bgStars = [];
    for (let i = 0; i < 90; i++) {
      bgStars.push({
        x: Math.random() * w,
        y: Math.random() * (h * 0.55),
        r: Math.random() * 1.3 + 0.3,
        speed: Math.random() * 0.3 + 0.1
      });
    }
    moon.r = Math.min(w, h) * 0.055;
  }

  // ── DURATION BUTTONS ──
  function syncDurBtns() {
    document.querySelectorAll('.dur-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.val) === gameDuration);
    });
  }
  document.querySelectorAll('.dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      gameDuration = parseInt(btn.dataset.val);
      syncDurBtns();
    });
  });

  // ── SETTINGS (works mid-game, pauses timer) ──
  document.getElementById('settings-btn').addEventListener('click', () => {
    document.getElementById('settings-screen').style.display = 'flex';
    if (gameActive && !timerPaused) {
      timerPaused = true;
      clearInterval(timerInterval);
    }
  });
  document.getElementById('settings-close-btn').addEventListener('click', () => {
    document.getElementById('settings-screen').style.display = 'none';
    if (gameActive && timerPaused) {
      timerPaused = false;
      timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 0) endGame();
      }, 1000);
    }
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('score-popup').style.display = 'none';
    startGame();
  });

  // ── GAME START ──
  function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('score-popup').style.display  = 'none';
    power = 0; taps = 0; maxSpeed = 0; bestTps = 0; displaySpeed = 0;
    particles = []; tapTimes = [];
    timeLeft = gameDuration;
    gameActive = true; gameStarted = true; timerPaused = false;
    timerDisplay.textContent = timeLeft;
    tapsVal.textContent = '0';
    pressBtn.disabled = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeft--;
      timerDisplay.textContent = timeLeft;
      if (timeLeft <= 0) endGame();
    }, 1000);
    if (animId) cancelAnimationFrame(animId);
    lastFrameTime = performance.now();
    animId = requestAnimationFrame(loop);
  }

  // ── GAME END ──
  function endGame() {
    gameActive = false;
    clearInterval(timerInterval);
    pressBtn.disabled = true;
    const score = Math.round(taps * 10 + maxSpeed * 5);
    let r = 'D';
    if      (score > 5000) r = 'S+';
    else if (score > 3000) r = 'S';
    else if (score > 1500) r = 'A';
    else if (score > 700)  r = 'B';
    else if (score > 300)  r = 'C';
    document.getElementById('final-taps').textContent  = taps;
    document.getElementById('final-speed').textContent = Math.round(maxSpeed);
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-tps').textContent   = bestTps.toFixed(1);
    const badge = document.getElementById('rating-badge');
    badge.textContent  = r;
    badge.style.color  = r.startsWith('S') ? '#3cf0ff' : r === 'A' ? '#f5e642' : r === 'B' ? '#7fff7f' : '#aaa';
    badge.style.textShadow = '0 0 20px currentColor';
    document.getElementById('score-popup').style.display = 'flex';
  }

  // ── TAP HANDLER ──
  function handleTap() {
    if (!gameActive) return;
    taps++;
    tapsVal.textContent = taps;

    const now = performance.now();
    tapTimes.push(now);
    tapTimes = tapTimes.filter(t => now - t < 1000);
    const tps = tapTimes.length;
    if (tps > bestTps) bestTps = tps;

    // Simple gain: +4 per tap, max 100
    power = Math.min(100, power + 4);

    tapFlash.classList.add('active');
    setTimeout(() => tapFlash.classList.remove('active'), 60);
    pressBtn.classList.add('tapped');
    setTimeout(() => pressBtn.classList.remove('tapped'), 80);
    burstRearWheelSmoke();
  }

  pressBtn.addEventListener('click', e => { handleTap(); pressBtn.blur(); });
  pressBtn.addEventListener('touchstart', e => { e.preventDefault(); handleTap(); }, { passive: false });
  canvas.addEventListener('click', handleTap);

  // Enter key — only fresh press (not hold)
  document.addEventListener('keydown', e => {
    if (e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) handleTap();
    }
  }, true);

  // ── SMOKE SYSTEM ──
  function burstRearWheelSmoke() {
    const density = 3 + Math.floor(power / 15);
    for (let i = 0; i < density; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 0.9;
      const spd   = 1.5 + Math.random() * 2.5 * (power / 60 + 0.5);
      particles.push({
        x:    rearWheelWorld.x + (Math.random() - 0.5) * 7,
        y:    rearWheelWorld.y + (Math.random() - 0.5) * 5,
        vx:   Math.cos(angle) * spd,
        vy:   Math.sin(angle) * spd - 0.5,
        life: 1,
        decay: 0.018 + Math.random() * 0.022,
        size: 4 + Math.random() * 8 * (power / 60 + 0.5),
        col:  power > 60 ? 'rgba(210,90,70,' : 'rgba(180,180,180,'
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy -= 0.04;
      p.vx *= 0.97;
      p.size += 0.35;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.col + (p.life * 0.4) + ')';
      ctx.fill();
    });
  }

  // ── BACKGROUND ──
  function drawBackground(w, h) {
    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    sky.addColorStop(0, '#08081a');
    sky.addColorStop(1, '#1a1535');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.65);

    // Scrolling stars
    const spd = power / 100 * 2.5;
    bgStars.forEach(s => {
      s.x -= s.speed * spd;
      if (s.x < 0) s.x = w;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + s.r * 0.3})`;
      ctx.fill();
    });

    // ── Moon ──
    moon.glowPhase += 0.015;
    const mx = w * moon.x;
    const my = h * moon.y;
    const mr = moon.r || Math.min(w, h) * 0.055;
    const glowPulse = 1 + Math.sin(moon.glowPhase) * 0.12;

    // Outer soft glow
    const glowR = mr * 2.8 * glowPulse;
    const glow1 = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, glowR);
    glow1.addColorStop(0,   'rgba(220,220,160,0.13)');
    glow1.addColorStop(0.4, 'rgba(200,200,120,0.07)');
    glow1.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow1;
    ctx.beginPath(); ctx.arc(mx, my, glowR, 0, Math.PI * 2); ctx.fill();

    // Moon body
    const moonGrad = ctx.createRadialGradient(mx - mr * 0.28, my - mr * 0.28, mr * 0.05, mx, my, mr);
    moonGrad.addColorStop(0,    '#fffff0');
    moonGrad.addColorStop(0.35, '#e8e8c8');
    moonGrad.addColorStop(0.75, '#c8c890');
    moonGrad.addColorStop(1,    '#a0a060');
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fillStyle = moonGrad; ctx.fill();

    // Crescent shadow
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
    const shadowGrad = ctx.createRadialGradient(mx + mr * 0.55, my - mr * 0.1, 0, mx + mr * 0.55, my, mr * 1.1);
    shadowGrad.addColorStop(0,    'rgba(5,5,20,0.97)');
    shadowGrad.addColorStop(0.45, 'rgba(5,5,20,0.92)');
    shadowGrad.addColorStop(0.75, 'rgba(5,5,20,0.3)');
    shadowGrad.addColorStop(1,    'rgba(5,5,20,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    ctx.restore();

    // Craters
    const craters = [
      { ox: -0.30, oy:  0.20, r: 0.12 },
      { ox:  0.10, oy: -0.35, r: 0.09 },
      { ox: -0.10, oy:  0.42, r: 0.07 },
      { ox:  0.25, oy:  0.15, r: 0.06 }
    ];
    craters.forEach(c => {
      ctx.save();
      ctx.beginPath(); ctx.arc(mx + c.ox * mr, my + c.oy * mr, c.r * mr, 0, Math.PI * 2); ctx.clip();
      const cg = ctx.createRadialGradient(mx + c.ox * mr, my + c.oy * mr, 0, mx + c.ox * mr, my + c.oy * mr, c.r * mr);
      cg.addColorStop(0, 'rgba(0,0,0,0.25)');
      cg.addColorStop(1, 'rgba(255,255,200,0.04)');
      ctx.fillStyle = cg;
      ctx.fillRect(mx + c.ox * mr - c.r * mr, my + c.oy * mr - c.r * mr, c.r * mr * 2, c.r * mr * 2);
      ctx.restore();
    });

    // Rim light
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,200,0.18)'; ctx.lineWidth = 1; ctx.stroke();

    // Horizon glow
    const hori = ctx.createLinearGradient(0, h * 0.54, 0, h * 0.66);
    hori.addColorStop(0,   'transparent');
    hori.addColorStop(0.5, 'rgba(180,74,255,0.12)');
    hori.addColorStop(1,   'transparent');
    ctx.fillStyle = hori;
    ctx.fillRect(0, h * 0.54, w, h * 0.12);

    drawCity(w, h * 0.62);
  }

  // ── CITY SILHOUETTE ──
  function drawCity(w, baseY) {
    const blds = [
      { x: 0.02, bw: 0.04, h: 0.09 }, { x: 0.07, bw: 0.03, h: 0.13 }, { x: 0.11, bw: 0.05, h: 0.07 },
      { x: 0.17, bw: 0.03, h: 0.16 }, { x: 0.21, bw: 0.04, h: 0.06 }, { x: 0.26, bw: 0.06, h: 0.12 },
      { x: 0.33, bw: 0.03, h: 0.10 }, { x: 0.37, bw: 0.05, h: 0.15 }, { x: 0.43, bw: 0.04, h: 0.07 },
      { x: 0.48, bw: 0.03, h: 0.17 }, { x: 0.52, bw: 0.06, h: 0.08 }, { x: 0.59, bw: 0.04, h: 0.13 },
      { x: 0.64, bw: 0.03, h: 0.06 }, { x: 0.68, bw: 0.05, h: 0.14 }, { x: 0.74, bw: 0.04, h: 0.09 },
      { x: 0.79, bw: 0.03, h: 0.11 }, { x: 0.83, bw: 0.06, h: 0.07 }, { x: 0.90, bw: 0.04, h: 0.12 },
      { x: 0.95, bw: 0.05, h: 0.08 }
    ];
    blds.forEach(b => {
      ctx.fillStyle = '#0e0e20';
      ctx.fillRect(b.x * w, baseY - b.h * w * 0.22, b.bw * w, b.h * w * 0.22);
      for (let wy = baseY - b.h * w * 0.22 + 4; wy < baseY - 4; wy += 7) {
        for (let wx = b.x * w + 3; wx < (b.x + b.bw) * w - 3; wx += 6) {
          if (Math.random() < 0.35) {
            ctx.fillStyle = 'rgba(255,220,120,0.13)';
            ctx.fillRect(wx, wy, 3, 3);
          }
        }
      }
    });
  }

  // ── ROAD ──
  function drawRoad(w, h, dt) {
    const roadTop = h * 0.62, roadH = h - roadTop;
    const rg = ctx.createLinearGradient(0, roadTop, 0, h);
    rg.addColorStop(0, '#1f1f2e'); rg.addColorStop(1, '#111120');
    ctx.fillStyle = rg; ctx.fillRect(0, roadTop, w, roadH);

    ctx.strokeStyle = '#f5e64240'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, roadTop + 1); ctx.lineTo(w, roadTop + 1); ctx.stroke();
    ctx.strokeStyle = '#f5e64218';
    ctx.beginPath(); ctx.moveTo(0, h - 2); ctx.lineTo(w, h - 2); ctx.stroke();

    roadOffset = (roadOffset + (power / 100) * 12 * 60 * dt) % 80;
    const dashY = roadTop + roadH * 0.5;
    ctx.setLineDash([40, 40]); ctx.lineDashOffset = -roadOffset;
    ctx.strokeStyle = '#ffffff28'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, dashY); ctx.lineTo(w, dashY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff07';
    for (let i = 0; i < 4; i++) {
      const ox = ((roadOffset * 2 + i * (w / 4)) % w) - 20;
      ctx.fillRect(ox, roadTop + roadH * 0.15, 60, 3);
      ctx.fillRect(ox + w / 4, roadTop + roadH * 0.75, 40, 2);
    }
  }

  // ── BUGATTI-STYLE CAR ──
  function drawCar(w, h) {
    const roadTop = h * 0.62, roadH = h - roadTop;
    const carW  = Math.min(w * 0.44, 210);
    const carH  = carW * 0.40;
    const wheelR = carH * 0.25;
    const carX  = w * 0.22 - carW / 2 + carShake.x;
    const carY  = roadTop + roadH * 0.18 - carH + carShake.y;

    // Track rear wheel world position for smoke
    rearWheelWorld.x = carX + carW * 0.21;
    rearWheelWorld.y = carY + carH + wheelR * 0.1;

    ctx.save();
    ctx.translate(carX, carY);

    // Shadow
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(carW / 2, carH + 18, carW * 0.45, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Underbody
    ctx.fillStyle = '#0a0a18';
    ctx.beginPath();
    ctx.moveTo(carW * 0.09, carH * 0.92); ctx.lineTo(carW * 0.98, carH * 0.92);
    ctx.lineTo(carW * 1.03, carH * 0.78); ctx.lineTo(carW * 0.07, carH * 0.78);
    ctx.closePath(); ctx.fill();

    // Main body (Chiron silhouette)
    const bodyG = ctx.createLinearGradient(0, carH * 0.12, 0, carH * 0.88);
    bodyG.addColorStop(0,    '#4040ff');
    bodyG.addColorStop(0.45, '#2020cc');
    bodyG.addColorStop(1,    '#10107a');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(carW * 0.09, carH * 0.78);
    ctx.lineTo(carW * 0.06, carH * 0.46);
    ctx.lineTo(carW * 0.11, carH * 0.20);
    ctx.lineTo(carW * 0.32, carH * 0.07);
    ctx.lineTo(carW * 0.66, carH * 0.07);
    ctx.lineTo(carW * 0.83, carH * 0.21);
    ctx.lineTo(carW * 0.95, carH * 0.40);
    ctx.lineTo(carW * 1.02, carH * 0.56);
    ctx.lineTo(carW * 1.03, carH * 0.78);
    ctx.closePath(); ctx.fill();

    // Top highlight
    const hiG = ctx.createLinearGradient(0, carH * 0.07, 0, carH * 0.34);
    hiG.addColorStop(0, 'rgba(130,130,255,0.5)'); hiG.addColorStop(1, 'transparent');
    ctx.fillStyle = hiG;
    ctx.beginPath();
    ctx.moveTo(carW * 0.11, carH * 0.20); ctx.lineTo(carW * 0.32, carH * 0.07);
    ctx.lineTo(carW * 0.66, carH * 0.07); ctx.lineTo(carW * 0.83, carH * 0.21);
    ctx.lineTo(carW * 0.66, carH * 0.33); ctx.lineTo(carW * 0.32, carH * 0.33);
    ctx.closePath(); ctx.fill();

    // Bugatti black C-band
    ctx.fillStyle = '#06060f';
    ctx.fillRect(carW * 0.24, carH * 0.24, carW * 0.09, carH * 0.52); // rear pillar
    ctx.fillRect(carW * 0.60, carH * 0.24, carW * 0.09, carH * 0.52); // front pillar
    ctx.fillRect(carW * 0.24, carH * 0.24, carW * 0.45, carH * 0.10); // top band
    ctx.fillRect(carW * 0.24, carH * 0.62, carW * 0.45, carH * 0.10); // bottom band

    // Windshield
    ctx.fillStyle = 'rgba(80,190,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(carW * 0.36, carH * 0.30); ctx.lineTo(carW * 0.40, carH * 0.10);
    ctx.lineTo(carW * 0.62, carH * 0.10); ctx.lineTo(carW * 0.65, carH * 0.30);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(140,210,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();

    // Rear quarter glass
    ctx.fillStyle = 'rgba(60,130,220,0.18)';
    ctx.beginPath();
    ctx.moveTo(carW * 0.12, carH * 0.28); ctx.lineTo(carW * 0.15, carH * 0.12);
    ctx.lineTo(carW * 0.25, carH * 0.12); ctx.lineTo(carW * 0.25, carH * 0.28);
    ctx.closePath(); ctx.fill();

    // Gold stripe
    ctx.fillStyle = '#f5c800';
    ctx.fillRect(carW * 0.02, carH * 0.60, carW * 0.97, carH * 0.055);

    // Side vents
    ctx.fillStyle = '#050512';
    for (let v = 0; v < 3; v++) ctx.fillRect(carW * 0.07, carH * (0.35 + v * 0.09), carW * 0.045, carH * 0.055);

    // Front LED headlight
    ctx.fillStyle = '#ddf8ff';
    ctx.beginPath(); ctx.roundRect(carW * 0.92, carH * 0.36, carW * 0.10, carH * 0.11, 2); ctx.fill();
    ctx.shadowColor = '#c0f0ff'; ctx.shadowBlur = 10 + power * 0.14; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(carW * 0.88, carH * 0.41); ctx.lineTo(carW * 0.93, carH * 0.41); ctx.stroke();

    // Tail lights
    ctx.fillStyle = '#ff1a1a';
    ctx.beginPath(); ctx.roundRect(carW * 0.02, carH * 0.32, carW * 0.055, carH * 0.20, 2); ctx.fill();
    if (power > 0) { ctx.shadowColor = '#ff1111'; ctx.shadowBlur = 14 + power * 0.14; ctx.fill(); ctx.shadowBlur = 0; }

    // Rear wing / spoiler
    ctx.fillStyle = '#181848';
    ctx.fillRect(-carW * 0.03, carH * 0.12, carW * 0.12, carH * 0.045);
    ctx.fillRect(carW * 0.01,  carH * 0.16, carW * 0.04, carH * 0.28);

    // Exhausts
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(carW * 0.03, carH * 0.78, carW * 0.09, carH * 0.07);
    ctx.fillRect(carW * 0.03, carH * 0.70, carW * 0.09, carH * 0.06);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(carW * 0.075, carH * 0.815, carH * 0.030, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(carW * 0.075, carH * 0.730, carH * 0.025, 0, Math.PI * 2); ctx.fill();

    // Front splitter
    ctx.fillStyle = '#08081a';
    ctx.beginPath();
    ctx.moveTo(carW * 0.84, carH * 0.78); ctx.lineTo(carW * 1.05, carH * 0.78);
    ctx.lineTo(carW * 1.05, carH * 0.85); ctx.lineTo(carW * 0.84, carH * 0.85);
    ctx.closePath(); ctx.fill();

    // Wheels
    drawWheel(ctx, carW * 0.21, carH, wheelR, power);
    drawWheel(ctx, carW * 0.79, carH, wheelR, power);

    ctx.restore();
  }

  function drawWheel(ctx, cx, baseY, r, pwr) {
    ctx.save();
    ctx.translate(cx, baseY + r * 0.10);
    // Tyre
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0c0c'; ctx.fill();
    ctx.strokeStyle = '#252525'; ctx.lineWidth = 2.5; ctx.stroke();
    // Rim
    const rimG = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.72);
    rimG.addColorStop(0, '#ccc'); rimG.addColorStop(0.6, '#888'); rimG.addColorStop(1, '#555');
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.fillStyle = rimG; ctx.fill();
    // Y-spokes (5)
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate((i / 5) * Math.PI * 2);
      ctx.fillStyle = '#424242';
      ctx.beginPath();
      ctx.moveTo(-r * 0.07, -r * 0.14); ctx.lineTo(r * 0.07, -r * 0.14);
      ctx.lineTo(r * 0.11,  -r * 0.66); ctx.lineTo(-r * 0.11, -r * 0.66);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // Center
    ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fillStyle = '#1a1a1a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.10, 0, Math.PI * 2); ctx.fillStyle = '#f5c800'; ctx.fill();
    // Brake glow at high speed
    if (pwr > 40) {
      ctx.save(); ctx.globalAlpha = (pwr - 40) / 130;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5500'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ── SPEEDOMETER ──
  function drawSpeedometer(speed) {
    const W = 176, H = 176, cx = 88, cy = 98, R = 72;
    sCtx.clearRect(0, 0, W, H);
    const maxKph = 280, startA = Math.PI * 0.75, endA = Math.PI * 2.25, sweep = endA - startA;
    const frac = Math.min(speed / maxKph, 1);

    // Background track
    sCtx.beginPath(); sCtx.arc(cx, cy, R, startA, endA);
    sCtx.strokeStyle = 'rgba(255,255,255,0.07)'; sCtx.lineWidth = 11; sCtx.stroke();

    // Coloured arc
    if (frac > 0) {
      const col = speed > 200 ? '#ff4499' : speed > 120 ? '#b44aff' : '#7733cc';
      sCtx.save();
      sCtx.beginPath(); sCtx.arc(cx, cy, R, startA, startA + sweep * frac);
      sCtx.strokeStyle = col; sCtx.lineWidth = 11; sCtx.lineCap = 'round';
      sCtx.shadowColor = col; sCtx.shadowBlur = 20;
      sCtx.stroke(); sCtx.restore();
    }

    // Tick marks
    for (let i = 0; i <= 14; i++) {
      const a = startA + (sweep * i / 14);
      const maj = (i % 2 === 0);
      sCtx.beginPath();
      sCtx.moveTo(cx + Math.cos(a) * (R - (maj ? 19 : 13)), cy + Math.sin(a) * (R - (maj ? 19 : 13)));
      sCtx.lineTo(cx + Math.cos(a) * (R - 7),               cy + Math.sin(a) * (R - 7));
      sCtx.strokeStyle = maj ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)';
      sCtx.lineWidth = maj ? 2 : 1; sCtx.stroke();
    }

    // Needle
    const na = startA + sweep * frac;
    sCtx.save(); sCtx.translate(cx, cy); sCtx.rotate(na);
    sCtx.beginPath(); sCtx.moveTo(0, 7); sCtx.lineTo(0, -(R - 18));
    sCtx.strokeStyle = '#fff'; sCtx.lineWidth = 2; sCtx.lineCap = 'round';
    sCtx.shadowColor = '#fff'; sCtx.shadowBlur = 7; sCtx.stroke(); sCtx.restore();

    // Center dots
    sCtx.beginPath(); sCtx.arc(cx, cy, 7, 0, Math.PI * 2); sCtx.fillStyle = '#fff'; sCtx.fill();
    sCtx.beginPath(); sCtx.arc(cx, cy, 3.5, 0, Math.PI * 2); sCtx.fillStyle = '#b44aff'; sCtx.fill();

    // Speed number
    sCtx.fillStyle = '#fff';
    sCtx.font = 'bold 20px "Share Tech Mono",monospace';
    sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
    sCtx.shadowColor = 'rgba(180,74,255,0.9)'; sCtx.shadowBlur = 10;
    sCtx.fillText(Math.round(speed), cx, cy + 27); sCtx.shadowBlur = 0;
    sCtx.font = '9px "Orbitron",sans-serif';
    sCtx.fillStyle = 'rgba(255,255,255,0.38)';
    sCtx.fillText('KM/H', cx, cy + 42);
  }

  function getSpeed() { return power / 100 * 280; }

  // ── MAIN LOOP ──
  function loop(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    const { w, h } = getCanvasSize();
    ctx.clearRect(0, 0, w, h);

    if (gameActive) {
      power = Math.max(0, power - (0.06 + power * 0.001) * 60 * dt);
      const spd = getSpeed();
      if (spd > maxSpeed) maxSpeed = spd;
    }

    displaySpeed += (getSpeed() - displaySpeed) * 0.12;

    shakeTimer += dt;
    if (power > 5) {
      const t = power / 100 * 2.5;
      carShake.x = Math.sin(shakeTimer * 62) * t;
      carShake.y = Math.cos(shakeTimer * 48) * t * 0.6;
    } else {
      carShake.x = 0; carShake.y = 0;
    }

    drawBackground(w, h);
    updateParticles(dt);
    drawParticles();
    drawRoad(w, h, dt);
    drawCar(w, h);

    // Speed lines at high power
    if (power > 50) {
      ctx.save(); ctx.globalAlpha = (power - 50) / 100 * 0.38;
      const rt = h * 0.62;
      for (let i = 0; i < 8; i++) {
        const lx  = w * 0.28 + Math.random() * w * 0.72;
        const ly  = rt + Math.random() * (h - rt);
        const len = 20 + Math.random() * 60 * (power / 100);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + len, ly); ctx.stroke();
      }
      ctx.restore();
    }

    powerFill.style.width = power + '%';
    drawSpeedometer(displaySpeed);

    if (timeLeft <= 5) {
      timerDisplay.style.color      = '#ff3c3c';
      timerDisplay.style.textShadow = '0 0 10px #ff3c3c';
    } else {
      timerDisplay.style.color      = 'var(--neon-blue)';
      timerDisplay.style.textShadow = '0 0 10px var(--neon-blue)';
    }

    if (gameStarted) animId = requestAnimationFrame(loop);
  }

  // ── IDLE LOOP (before game starts) ──
  function idleLoop(now) {
    if (gameStarted) return;
    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    const { w, h } = getCanvasSize();
    ctx.clearRect(0, 0, w, h);
    drawBackground(w, h);
    drawRoad(w, h, dt);
    drawCar(w, h);
    drawSpeedometer(0);
    requestAnimationFrame(idleLoop);
  }
  requestAnimationFrame(idleLoop);

})();
