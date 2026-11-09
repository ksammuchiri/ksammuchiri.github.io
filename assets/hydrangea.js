// Glass hydrangeas — one fixed WebGL overlay; each bloom follows a [data-hydrangea] anchor in the page.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const anchors = [...document.querySelectorAll('[data-hydrangea]')];
const mobile = matchMedia('(max-width: 900px)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
if (anchors.length && webglOK()) init();

function init() {
  const canvas = document.createElement('canvas');
  canvas.className = 'hydrangea-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1, 1.4, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc9d6ff, 1.4); rim.position.set(1.5, -0.5, -1); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);

  // ---------- geometry ----------
  const petalGeo = (() => {
    const s = new THREE.Shape();           // hydrangea sepal: broad, rounded-rhombic
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.5, 0.3, 0.44, 0.6);
    s.quadraticCurveTo(0.34, 0.96, 0, 1.02);
    s.quadraticCurveTo(-0.34, 0.96, -0.44, 0.6);
    s.quadraticCurveTo(-0.5, 0.3, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: mobile ? 10 : 16 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, p.getZ(i) + 0.22 * x * x - 0.06 * y * y); // gentle cup, tip curls back
    }
    g.computeVertexNormals();
    return g;
  })();
  const pearlGeo = new THREE.SphereGeometry(1, 12, 10);
  const leafGeo = (() => {                // ovate, pointed leaf with a centre fold
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.55, 0.25, 0.62, 0.95, 0, 1.55);
    s.bezierCurveTo(-0.62, 0.95, -0.55, 0.25, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 20 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) + 0.35 * Math.abs(x) - 0.08 * y * y); }
    g.computeVertexNormals(); return g;
  })();

  // ---------- materials ----------
  const glass = (light) => { const gm = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.05, roughness: 0.06,
    transparent: true, opacity: light ? 0.72 : 0.58, depthWrite: false, side: THREE.DoubleSide,
    iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 720],
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: light ? 1.25 : 1.7,
    specularIntensity: 1, sheen: 0.4, sheenColor: new THREE.Color(0xffe0ec)
  }); gm.userData.base = gm.opacity; return gm; };
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xe9cf6a, roughness: 0.2, metalness: 0.35, clearcoat: 1, envMapIntensity: 1.3 });

  const tones = {
    pink:  [0xf07f9f, 0xe46a8c, 0xf59ab2, 0xd8607f, 0xf7b3c4, 0xec7896],
    lilac: [0xb59be8, 0xa18fe7, 0xc4a6ef, 0x9a9ee9, 0xd3bff3],
    blue:  [0x8d9fe8, 0x7f97e3, 0x9aa9ee]          // the cool lower edge of the lilac head
  };
  const C = (arr) => arr.map(c => new THREE.Color(c));
  const pal = { pink: C(tones.pink), lilac: C(tones.lilac), blue: C(tones.blue) };

  // seeded random so each bloom is the same on every visit
  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function makeHead(seed, light, tone) {
    const rand = rng(seed);
    const N = mobile ? 52 : 80;
    const petals = new THREE.InstancedMesh(petalGeo, glass(light), N * 4);
    const centers = new THREE.InstancedMesh(pearlGeo, pearl, N);
    const m = new THREE.Matrix4(), f = new THREE.Matrix4(), pm = new THREE.Matrix4();
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));
    let k = 0;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const z = 1 - t * 1.45;                 // dome cap, front-facing like a hydrangea head
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const a = i * golden;
      n.set(Math.cos(a) * r, Math.sin(a) * r, z).normalize();
      q.setFromUnitVectors(up, n);
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(n, rand() * Math.PI * 2));
      const s = 0.25 + rand() * 0.06;
      f.compose(n.clone().multiplyScalar(1 + rand() * 0.06), q, new THREE.Vector3(s, s, s));
      let p = pal[tone] || pal.lilac;
      if (tone === 'lilac' && n.y < -0.25 && n.x > -0.2 && rand() < 0.75) p = pal.blue;
      const col = p[Math.floor(rand() * p.length)];
      for (let j = 0; j < 4; j++) {
        pm.makeRotationZ(j * Math.PI / 2 + (rand() - 0.5) * 0.2).multiply(new THREE.Matrix4().makeRotationX(-0.12 - rand() * 0.14));
        m.multiplyMatrices(f, pm);
        petals.setMatrixAt(k, m); petals.setColorAt(k, col); k++;
      }
      m.compose(n.clone().multiplyScalar(1.05), q, new THREE.Vector3(0.026, 0.026, 0.026));
      centers.setMatrixAt(i, m);
    }
    petals.instanceMatrix.needsUpdate = true; petals.instanceColor.needsUpdate = true;
    const g = new THREE.Group(); g.add(petals, centers);
    return g;
  }

  function stemMat(light) { const mm = glass(light); mm.color = new THREE.Color(0x6fae6c); mm.opacity = mm.userData.base = mm.opacity * 0.9; return mm; }
  function addLeaf(g, mat, curve, at, side, size, lift) {
    const leaf = new THREE.Mesh(leafGeo, mat);
    leaf.position.copy(curve.getPoint(at));
    leaf.rotation.set(-0.45 + (lift || 0), 0.25 * side, side * 1.05);
    leaf.scale.set(side * size, size, size);
    g.add(leaf);
  }

  // single stemmed head (contact)
  function makeStemmed(seed, light, tone) {
    const g = new THREE.Group();
    g.add(makeHead(seed, light, tone));
    const mat = stemMat(light);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.55, -0.4), new THREE.Vector3(0.08, -1.5, -0.2), new THREE.Vector3(-0.05, -2.4, 0), new THREE.Vector3(0.12, -3.3, 0.1)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.045, 10), mat));
    addLeaf(g, mat, curve, 0.5, 1, 0.78); addLeaf(g, mat, curve, 0.62, -1, 0.78);
    return g;
  }

  // the pair: pink head left, lilac-blue head right, stems crossing below, leaves in opposite pairs
  function makePair(seed, light) {
    const g = new THREE.Group();
    const pink = makeHead(seed, light, 'pink');  pink.position.set(-0.78, 1.05, 0.15); pink.scale.setScalar(1.28);
    const lil  = makeHead(seed + 31, light, 'lilac'); lil.position.set(1.1, 0.62, -0.35); lil.scale.setScalar(1.18); lil.rotation.y = -0.25;
    g.add(pink, lil);
    const mat = stemMat(light);
    const sPink = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, 0.1, -0.2), new THREE.Vector3(-0.15, -0.9, 0), new THREE.Vector3(0.18, -2.0, 0.05), new THREE.Vector3(0.32, -3.3, 0.05)]);
    const sLil  = new THREE.CatmullRomCurve3([new THREE.Vector3(0.75, -0.25, -0.4), new THREE.Vector3(0.45, -1.1, -0.15), new THREE.Vector3(0.08, -2.1, 0), new THREE.Vector3(-0.08, -3.4, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(sPink, 60, 0.05, 10), mat));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(sLil, 60, 0.045, 10), mat));
    // thin pedicels fanning up into each head, as in the painting
    [[-0.9, 0.55], [-0.45, 0.6], [-0.1, 0.5]].forEach(([x, y]) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([sPink.getPoint(0.05), new THREE.Vector3(x, y, 0)]), 8, 0.018, 6), mat)));
    [[0.55, 0.2], [0.95, 0.05], [1.3, 0.15]].forEach(([x, y]) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([sLil.getPoint(0.05), new THREE.Vector3(x, y, -0.2)]), 8, 0.016, 6), mat)));
    addLeaf(g, mat, sPink, 0.1, -1, 0.95, 0.1); addLeaf(g, mat, sPink, 0.14, 1, 0.8);
    addLeaf(g, mat, sPink, 0.46, -1, 0.9); addLeaf(g, mat, sPink, 0.5, 1, 0.82, 0.15);
    addLeaf(g, mat, sLil, 0.12, 1, 0.8); addLeaf(g, mat, sLil, 0.34, 1, 0.92, 0.1);
    addLeaf(g, mat, sLil, 0.38, -1, 0.78); addLeaf(g, mat, sLil, 0.62, 1, 0.7);
    g.position.y = 0;   // visual centre roughly at y = -0.9; handled when positioning
    return g;
  }

  // ---------- blooms bound to anchors ----------
  const blooms = anchors
    .filter(el => !mobile || el.dataset.hydrangeaMobile !== 'off')
    .map((el, i) => {
      const light = !el.closest('.dark');
      const tone = el.dataset.tone || (i % 2 ? 'pink' : 'lilac');
      const mode = mobile ? 'head' : (el.dataset.mode || 'head');
      const obj = mode === 'pair' ? makePair(1234 + i * 977, light) : mode === 'stem' ? makeStemmed(1234 + i * 977, light, tone) : makeHead(1234 + i * 977, light, tone);
      obj.userData.mode = mode;
      const mats = new Set(); obj.traverse(o => { if (o.material && o.material.transparent) mats.add(o.material); });
      const tilt = parseFloat(el.dataset.tilt || '0');
      scene.add(obj);
      return { el, obj, mats: [...mats], sec: el.closest('section') || document.body, phase: i * 1.7, tilt, seen: 0, visible: false };
    });

  const io = new IntersectionObserver(es => es.forEach(e => {
    const b = blooms.find(b => b.el === e.target); if (b) b.visible = e.isIntersecting;
  }), { rootMargin: '200px' });
  blooms.forEach(b => io.observe(b.el));

  // ---------- interaction ----------
  let mx = 0, my = 0, tmx = 0, tmy = 0, lastY = scrollY, vel = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - 0.5; tmy = e.clientY / innerHeight - 0.5; }, { passive: true });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.right = innerWidth; camera.bottom = -innerHeight; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    const dy = scrollY - lastY; lastY = scrollY;
    vel += (dy - vel) * 0.1;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    renderer.setScissorTest(false); renderer.clear();
    blooms.forEach(b => b.obj.visible = false);
    for (const b of blooms) {
      if (!b.visible) continue;
      const r = b.el.getBoundingClientRect();
      const size = Math.min(r.width, r.height);
      b.seen = Math.min(1, b.seen + (reduce ? 1 : 0.025));
      const ease = 1 - Math.pow(1 - b.seen, 3);
      const mode = b.obj.userData.mode;
      const grow = 0.75 + 0.25 * ease;
      const sway = reduce ? 0 : Math.sin(t * 0.35 + b.phase) * 0.18;
      const bob = reduce ? 0 : Math.sin(t * 0.6 + b.phase) * size * 0.015;
      let sc, cy = 0;
      if (mode === 'pair') { sc = r.height / 6.2 * grow; cy = 0.55; }
      else if (mode === 'stem') { sc = r.height / 4.7 * grow; cy = 1.1; }
      else sc = (size / 2.6) * grow;
      b.obj.position.set(r.left + r.width / 2, -(r.top + r.height / 2) + bob + cy * sc, 0);
      b.obj.scale.setScalar(sc);
      if (mode === 'head') {
        b.obj.rotation.set(-0.35 + b.tilt + my * 0.4 + sway * 0.4 + vel * 0.004,
          sway + mx * 0.6 + (reduce ? 0 : t * 0.08) + b.phase, Math.sin(t * 0.25 + b.phase) * 0.06);
      } else {   // stemmed blooms sway like they're in a breeze, no full spin
        b.obj.rotation.set(-0.08 + b.tilt + my * 0.2 + vel * 0.002,
          sway * 0.9 + mx * 0.45, Math.sin(t * 0.3 + b.phase) * 0.04 - mx * 0.05);
      }
      b.mats.forEach(m => { m.opacity = m.userData.base * ease; });
      // clip the bloom to its own section so it never spills into the next one
      const sr = b.sec.getBoundingClientRect();
      const top = Math.max(0, sr.top), bottom = Math.min(innerHeight, sr.bottom);
      if (bottom <= top) continue;
      b.obj.visible = true;
      renderer.setScissorTest(true);
      renderer.setScissor(0, innerHeight - bottom, innerWidth, bottom - top);
      renderer.autoClear = false;
      renderer.render(scene, camera);
      b.obj.visible = false;
    }
    if (!reduce) requestAnimationFrame(frame);
  }
  if (reduce) { addEventListener('scroll', () => requestAnimationFrame(frame), { passive: true }); frame(); }
  else requestAnimationFrame(frame);
}
