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
  const glass = (light) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.05, roughness: 0.06,
    transparent: true, opacity: light ? 0.72 : 0.58, depthWrite: false, side: THREE.DoubleSide,
    iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 720],
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: light ? 1.25 : 1.7,
    specularIntensity: 1, sheen: 0.4, sheenColor: new THREE.Color(0xd8ccff)
  });
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xcfc4f2, roughness: 0.15, metalness: 0.1, clearcoat: 1, iridescence: 0.8, envMapIntensity: 1.4 });

  const palette = [0x7f9fe6, 0x9a9cea, 0xb595e2, 0xa9c0f0, 0xd4d8f7, 0x8fb0ea].map(c => new THREE.Color(c));

  // seeded random so each bloom is the same on every visit
  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function makeBloom(seed, light, withStem) {
    const rand = rng(seed);
    const N = mobile ? 34 : 44;
    const R = 1;
    const petals = new THREE.InstancedMesh(petalGeo, glass(light), N * 4);
    const centers = new THREE.InstancedMesh(pearlGeo, pearl, N);
    const m = new THREE.Matrix4(), f = new THREE.Matrix4(), pm = new THREE.Matrix4();
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));
    let k = 0;
    for (let i = 0; i < N; i++) {
      // fibonacci points over a dome cap (front-facing, like a hydrangea head)
      const t = (i + 0.5) / N;
      const z = 1 - t * 1.45;                 // cap down to ~123°
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const a = i * golden;
      n.set(Math.cos(a) * r, Math.sin(a) * r, z).normalize();
      q.setFromUnitVectors(up, n);
      const spin = new THREE.Quaternion().setFromAxisAngle(n, rand() * Math.PI * 2);
      q.premultiply(spin);
      const s = 0.27 + rand() * 0.07;
      f.compose(n.clone().multiplyScalar(R + rand() * 0.06), q, new THREE.Vector3(s, s, s));
      const col = palette[Math.floor(rand() * palette.length)];
      for (let j = 0; j < 4; j++) {
        pm.makeRotationZ(j * Math.PI / 2 + (rand() - 0.5) * 0.2).multiply(new THREE.Matrix4().makeRotationX(-0.12 - rand() * 0.14));
        m.multiplyMatrices(f, pm);
        petals.setMatrixAt(k, m); petals.setColorAt(k, col); k++;
      }
      m.compose(n.clone().multiplyScalar(R + 0.05), q, new THREE.Vector3(0.022, 0.022, 0.022));
      centers.setMatrixAt(i, m);
    }
    petals.instanceMatrix.needsUpdate = true; petals.instanceColor.needsUpdate = true;
    const g = new THREE.Group(); g.add(petals, centers);
    if (withStem) {
      const leafMat = glass(light); leafMat.color = new THREE.Color(0xc4dccd); leafMat.opacity *= 0.85;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.55, -0.4), new THREE.Vector3(0.08, -1.5, -0.2), new THREE.Vector3(-0.05, -2.4, 0), new THREE.Vector3(0.12, -3.3, 0.1)]);
      const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.045, 10), leafMat);
      g.add(stem);
      const leaf = (sx, rotZ, at) => {
        const m = new THREE.Mesh(leafGeo, leafMat);
        const p = curve.getPoint(at); m.position.copy(p);
        m.rotation.set(-0.5, 0, rotZ); m.scale.set(sx * 0.78, 0.78, 0.78);
        g.add(m);
      };
      leaf(1, 0.95, 0.5); leaf(-1, -0.95, 0.62);
    }
    return g;
  }

  // ---------- blooms bound to anchors ----------
  const blooms = anchors
    .filter(el => !mobile || el.dataset.hydrangeaMobile !== 'off')
    .map((el, i) => {
      const light = !el.closest('.dark');
      const obj = makeBloom(1234 + i * 977, light, el.dataset.stem === 'on' && !mobile);
      const tilt = parseFloat(el.dataset.tilt || '0');
      scene.add(obj);
      return { el, obj, sec: el.closest('section') || document.body, phase: i * 1.7, tilt, seen: 0, visible: false };
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
      const sc = (size / 2.6) * (0.75 + 0.25 * ease);
      const bob = reduce ? 0 : Math.sin(t * 0.6 + b.phase) * size * 0.02;
      b.obj.position.set(r.left + r.width / 2, -(r.top + r.height / 2) + bob, 0);
      b.obj.scale.setScalar(sc);
      const sway = reduce ? 0 : Math.sin(t * 0.35 + b.phase) * 0.18;
      b.obj.rotation.set(
        -0.35 + b.tilt + my * 0.4 + sway * 0.4 + vel * 0.004,
        sway + mx * 0.6 + (reduce ? 0 : t * 0.08) + b.phase,
        Math.sin(t * 0.25 + b.phase) * 0.06
      );
      b.obj.children[0].material.opacity = (b.el.closest('.dark') ? 0.58 : 0.72) * ease;
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
