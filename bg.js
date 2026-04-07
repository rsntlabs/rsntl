/* bg.js — shared WebGPU animated background + CSS fallback
   Import as <script type="module" src="bg.js"></script>
   Expects: <canvas id="bg"> in the page. */

const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
const isDark  = () => darkMQ.matches;

// ── Blob count by viewport width ─────────────────────────────────────────────
// 2 parent blobs (index 0-1) + up to 4 child blobs (index 2-5)
const MAX_BLOBS  = 6;
function getBlobCount() {
  const w = window.innerWidth;
  if (w < 500) return 3;
  if (w < 900) return 4;
  return MAX_BLOBS;
}

// ── Position helpers (mirror WGSL math exactly) ───────────────────────────────
function parentPos(i, t) {
  const phi = i * Math.PI;
  const spd = 0.06 + i * 0.03;
  const orb = 0.30 + 0.08 * Math.sin(i * 1.7 + 0.5);
  return [
    0.5 + orb * Math.cos(t * spd + phi) * (0.9 + 0.1 * Math.sin(t * spd * 0.6 + phi)),
    0.5 + orb * Math.sin(t * spd * 0.75 + phi) * (0.9 + 0.1 * Math.cos(t * spd * 0.5 + phi)),
  ];
}

function childPos(idx, t) {
  const pc  = parentPos(idx % 2, t);
  const fi  = idx;
  const phi = fi * 2.39996323;
  const spd = 0.22 + fi * 0.07;
  const orb = 0.10 + 0.04 * Math.sin(fi * 2.1 + t * 0.08);
  return [
    pc[0] + orb * Math.cos(t * spd + phi),
    pc[1] + orb * Math.sin(t * spd * 0.85 + phi * 1.2),
  ];
}

// Compute all blob positions; push inactive ones off-screen.
function getBlobPositions(t, count) {
  const pos = [];
  for (let i = 0; i < MAX_BLOBS; i++) {
    pos.push(i >= count ? [-2.0, -2.0] : (i < 2 ? parentPos(i, t) : childPos(i - 2, t)));
  }
  return pos;
}

// ── WGSL shader ───────────────────────────────────────────────────────────────
// Blob positions now come from uniforms (computed + separated in JS).
// Uniform layout (16 × f32 = 64 bytes):
//   [0]  time      [1] dark_mode  [2] res_x   [3] res_y
//   [4..15] blob positions: x0,y0, x1,y1, ..., x5,y5
const WGSL = /* wgsl */`
struct Uni {
  time      : f32,
  dark_mode : f32,
  res_x     : f32,
  res_y     : f32,
  blobs     : array<vec2f, 6>,
}
@group(0) @binding(0) var<uniform> u: Uni;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var pts = array<vec2f,6>(
    vec2f(-1,-1), vec2f(1,-1), vec2f(1, 1),
    vec2f(-1,-1), vec2f(1, 1), vec2f(-1, 1)
  );
  return vec4f(pts[vi], 0.0, 1.0);
}

fn dark_col(i: u32) -> vec3f {
  switch i {
    case 0u  { return vec3f(0.50, 0.00, 1.00); }
    case 1u  { return vec3f(0.30, 0.00, 1.00); }
    case 2u  { return vec3f(0.65, 0.00, 1.00); }
    case 3u  { return vec3f(0.20, 0.00, 0.88); }
    case 4u  { return vec3f(0.75, 0.00, 1.00); }
    case 5u  { return vec3f(0.85, 0.00, 0.90); }
    default  { return vec3f(0.40, 0.00, 0.95); }
  }
}

fn light_col(i: u32) -> vec3f {
  switch i {
    case 0u  { return vec3f(0.50, 0.00, 1.00); }
    case 1u  { return vec3f(0.30, 0.00, 1.00); }
    case 2u  { return vec3f(0.65, 0.00, 1.00); }
    case 3u  { return vec3f(0.20, 0.00, 0.88); }
    case 4u  { return vec3f(0.75, 0.00, 1.00); }
    case 5u  { return vec3f(0.85, 0.00, 0.90); }
    default  { return vec3f(0.40, 0.00, 0.95); }
  }
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv  = vec2f(frag.x / u.res_x, 1.0 - frag.y / u.res_y);
  let t   = u.time;

  var total = 0.0;
  var col   = vec3f(0.0);

  for (var i = 0u; i < 6u; i++) {
    let fi = f32(i);
    let bp = u.blobs[i];
    var r:  f32;
    if i < 2u {
      r = 0.28 + 0.05 * sin(fi * 1.73 + t * 0.06);
    } else {
      r = 0.09 + 0.03 * sin(fi * 2.31 + t * 0.12);
    }
    let d = distance(uv, bp);
    let w = exp(-d * d / (r * r) * 3.5);
    let c = mix(light_col(i), dark_col(i), u.dark_mode);
    col   += c * w;
    total += w;
  }

  let bg_d    = vec3f(0.020, 0.020, 0.031);
  let bg_l    = vec3f(0.961, 0.961, 0.980);
  let bg      = mix(bg_l, bg_d, u.dark_mode);
  let amt     = clamp(total, 0.0, 1.0);
  let base    = mix(bg, col / max(total, 0.0001), min(amt, 1.0));
  let lum     = dot(base, vec3f(0.2126, 0.7152, 0.0722));
  let boosted = clamp(mix(vec3f(lum), base, 1.65), vec3f(0.0), vec3f(1.0));
  let rgba    = mix(bg, boosted, min(amt * 1.2, 1.0));

  return vec4f(rgba, 1.0);
}
`;

async function initWebGPU() {
  if (!navigator.gpu) throw new Error('WebGPU not supported');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');

  const device = await adapter.requestDevice();
  const canvas = document.getElementById('bg');
  const ctx    = canvas.getContext('webgpu');
  if (!ctx) throw new Error('webgpu context unavailable');

  const format = navigator.gpu.getPreferredCanvasFormat();

  let blobCount = getBlobCount();

  const configure = () => {
    canvas.width  = Math.round(window.innerWidth  * devicePixelRatio);
    canvas.height = Math.round(window.innerHeight * devicePixelRatio);
    ctx.configure({ device, format, alphaMode: 'opaque' });
    blobCount = getBlobCount();
  };
  configure();
  window.addEventListener('resize', configure, { passive: true });

  // 16 f32s = 64 bytes: [time, dark_mode, res_x, res_y, x0,y0, x1,y1, ..., x5,y5]
  const uBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgl  = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const bindGroup = device.createBindGroup({
    layout: bgl, entries: [{ binding: 0, resource: { buffer: uBuf } }],
  });

  const module   = device.createShaderModule({ code: WGSL });
  const compInfo = await module.getCompilationInfo();
  for (const msg of compInfo.messages) {
    if (msg.type === 'error') throw new Error(`WGSL error (line ${msg.lineNum}): ${msg.message}`);
  }

  const pipeline = await device.createRenderPipelineAsync({
    layout:    device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex:    { module, entryPoint: 'vs' },
    fragment:  { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const uni  = new Float32Array(16);
  const t0   = performance.now();
  const seed = Math.random() * 1000;

  const frame = () => {
    const t = seed + (performance.now() - t0) / 1000;
    uni[0] = t;
    uni[1] = isDark() ? 1.0 : 0.0;
    uni[2] = canvas.width;
    uni[3] = canvas.height;

    const pos = getBlobPositions(t, blobCount);
    for (let i = 0; i < MAX_BLOBS; i++) {
      uni[4 + i * 2]     = pos[i][0];
      uni[4 + i * 2 + 1] = pos[i][1];
    }

    device.queue.writeBuffer(uBuf, 0, uni);

    const enc  = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([enc.finish()]);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function initCSSFallback() {
  document.getElementById('bg').style.display = 'none';
  const field = document.createElement('div');
  field.className = 'blob-field';
  document.body.insertBefore(field, document.body.firstChild);

  const allDefs = [
    { color: '#7F00FF', size: 55, x: 25, y: 30, dur: 70 },
    { color: '#4D00FF', size: 50, x: 60, y: 55, dur: 90 },
    { color: '#A600FF', size: 18, x: 32, y: 22, dur: 28 },
    { color: '#6600F2', size: 14, x: 18, y: 40, dur: 22 },
    { color: '#BF00FF', size: 16, x: 68, y: 48, dur: 25 },
    { color: '#D900E5', size: 13, x: 55, y: 65, dur: 20 },
  ];
  const count = getBlobCount();
  const defs  = allDefs.slice(0, count);
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  defs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'blob';
    el.style.cssText = [
      `width:${d.size}vw`, `height:${d.size}vw`,
      `left:${d.x}%`, `top:${d.y}%`, `background:${d.color}`,
      `--a:${rnd(-20,20).toFixed(1)}vw`, `--b:${rnd(-20,20).toFixed(1)}vh`,
      `--c:${rnd(-20,20).toFixed(1)}vw`, `--d:${rnd(-20,20).toFixed(1)}vh`,
      `--e:${rnd(-15,15).toFixed(1)}vw`, `--f:${rnd(-15,15).toFixed(1)}vh`,
      `--s1:${rnd(0.85,1.2).toFixed(2)}`, `--s2:${rnd(0.80,1.25).toFixed(2)}`, `--s3:${rnd(0.90,1.15).toFixed(2)}`,
      `animation-duration:${d.dur}s`, `animation-delay:-${(Math.random()*d.dur).toFixed(2)}s`,
    ].join(';');
    field.appendChild(el);
  });
}

try {
  await initWebGPU();
} catch (err) {
  console.info('WebGPU unavailable, using CSS fallback.', err.message);
  initCSSFallback();
}
