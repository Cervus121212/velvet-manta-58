// hud — the DOM layer: cash, wanted stars, clock, radio, objective,
// message pill, dialogue, damage flash and the minimap canvas.
import { WORLD, RADIO, RANKS } from './config.js';
import { roadLines } from './world.js';

export function createHud(ctx) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: $('hud'), cash: $('cash'), rep: $('rep'), stars: $('stars'), clock: $('clock'),
    radio: $('radio'), objective: $('objective'), msg: $('msg'),
    dlg: $('dialogue'), dlgSpeaker: $('dlg-speaker'), dlgText: $('dlg-text'),
    map: $('minimap'), damage: $('damage'), muzzle: $('muzzle'),
    title: $('title'), testResults: $('test-results'),
    crosshair: $('crosshair'),
    _last: {}, _msgT: 0, _dlgT: 0,
  };
  hud.mapCtx = hud.map.getContext('2d');

  hud.set = function set(key, text) {
    if (hud._last[key] !== text) { hud._last[key] = text; hud[key].textContent = text; }
  };

  hud.showMessage = function showMessage(text) {
    hud.msg.textContent = text;
    hud.msg.classList.add('show');
    hud._msgT = 3.5;
  };

  hud.showDialogue = function showDialogue(speaker, text) {
    hud.dlgSpeaker.textContent = speaker;
    hud.dlgText.textContent = text;
    hud.dlg.classList.add('show');
    hud._dlgT = 6;
  };

  hud.setObjective = function setObjective(text) { hud.set('objective', text); };

  hud.flashDamage = function flashDamage() {
    hud.damage.style.opacity = '0.45';
    setTimeout(() => { hud.damage.style.opacity = '0'; }, 130);
  };

  hud.flashStars = function flashStars() {
    hud.stars.classList.remove('pulse');
    void hud.stars.offsetWidth;
    hud.stars.classList.add('pulse');
  };

  hud.showMuzzle = function showMuzzle() {
    hud.muzzle.style.opacity = '0.85';
    setTimeout(() => { hud.muzzle.style.opacity = '0'; }, 60);
  };

  hud.drawMinimap = function drawMinimap() {
    const c = hud.mapCtx, S = 180;
    const toMap = (x, z) => [((x + 290) / 580) * S, ((z + 290) / 580) * S];
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#10141a'; c.fillRect(0, 0, S, S);
    // sea (south + east) and beach
    c.fillStyle = '#1f6f8b';
    c.fillRect(0, toMap(0, 252)[1], S, S - toMap(0, 252)[1]);
    c.fillRect(toMap(252, 0)[0], 0, S - toMap(252, 0)[0], S);
    c.fillStyle = '#d9b380';
    c.fillRect(0, toMap(0, 216)[1], S, toMap(0, 252)[1] - toMap(0, 216)[1]);
    // roads
    c.strokeStyle = '#4a505c'; c.lineWidth = 3;
    for (const l of roadLines()) {
      const [x0] = toMap(l, 0); const [, z0] = toMap(0, l);
      c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0, S); c.stroke();
      c.beginPath(); c.moveTo(0, z0); c.lineTo(S, z0); c.stroke();
    }
    // mission marker
    if (ctx.mission && ctx.mission.marker) {
      const [mx, my] = toMap(ctx.mission.marker.x, ctx.mission.marker.z);
      c.fillStyle = '#ffd23e';
      c.beginPath(); c.arc(mx, my, 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffd23e'; c.lineWidth = 2;
      c.beginPath(); c.arc(mx, my, 10, 0, Math.PI * 2); c.stroke();
    }
    // traffic + police dots
    c.fillStyle = '#9aa3b0';
    for (const t of ctx.traffic) { const [x, y] = toMap(t.x, t.z); c.fillRect(x - 1, y - 1, 2, 2); }
    c.fillStyle = '#2a6bff';
    for (const cr of ctx.cruisers) { const [x, y] = toMap(cr.x, cr.z); c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
    if (ctx.heli) { const [x, y] = toMap(ctx.heli.x, ctx.heli.z); c.fillStyle = '#ff5a7a'; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
    // player triangle
    const [px, py] = toMap(ctx.player.x, ctx.player.z);
    c.fillStyle = '#ffffff';
    c.save(); c.translate(px, py); c.rotate(ctx.player.heading);
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
  };

  hud.update = function update(dt) {
    if (hud._msgT > 0) { hud._msgT -= dt; if (hud._msgT <= 0) hud.msg.classList.remove('show'); }
    if (hud._dlgT > 0) { hud._dlgT -= dt; if (hud._dlgT <= 0) hud.dlg.classList.remove('show'); }
    hud.set('cash', '$' + ctx.cash.toLocaleString());
    let rank = RANKS[0].name;
    for (const r of RANKS) if (ctx.completedMissions >= r.missions) rank = r.name;
    hud.set('rep', rank + '  •  ' + ctx.completedMissions + '/8 jobs');
    hud.set('stars', '★'.repeat(ctx.stars) + '☆'.repeat(5 - ctx.stars));
    const mins = Math.floor(ctx.clock.minutes) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    hud.set('clock', hh + ':' + mm);
    hud.set('radio', '♪ ' + RADIO[ctx.audio.station].name);
    // the crosshair is for shooting on foot, not for driving
    hud.crosshair.style.display = ctx.player.onFoot ? 'block' : 'none';
    hud.drawMinimap();
  };

  ctx.hud = hud;
  return hud;
}
