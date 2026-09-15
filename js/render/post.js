/* ==========================================================================
   The Wild West - js/render/post.js
   Post-processing: MSAA target, bloom, ACES tonemap, grade, vignette and sRGB encode.
   Provides:  Post
   Expects:   renderer, scene, camera, settings (declared in files loaded above)
   Classic script sharing one global scope with its siblings, so the order
   in index.html is load bearing. See README.md for the whole layout.
   ========================================================================== */
"use strict";
// =====================================================================
//  POST PROCESSING
//  scene -> HDR buffer -> bright pass -> separable blur -> composite.
//  The composite does the filmic tonemap, colour grade, vignette and the final
//  sRGB encode, so the frame is graded as one image rather than per material.
// =====================================================================
const Post = (() => {
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  fsScene.add(quad);
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({
    uniforms, vertexShader: VS, fragmentShader: frag, depthTest: false, depthWrite: false
  });
  const brightMat = mk([
    'uniform sampler2D tDiffuse; uniform float threshold; uniform float soft;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = max(max(c.r, c.g), c.b);',
    '  float k = smoothstep(threshold, threshold + soft, l);',
    '  gl_FragColor = vec4(c * k, 1.0);',
    '}'
  ].join('\n'), { tDiffuse: { value: null }, threshold: { value: 0.62 }, soft: { value: 0.75 } });
  const blurMat = mk([
    'uniform sampler2D tDiffuse; uniform vec2 dir;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;',
    '  s += texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb * 0.0702702703;',
    '  s += texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb * 0.0702702703;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}'
  ].join('\n'), { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
  const compMat = mk([
    'uniform sampler2D tScene; uniform sampler2D tBloom;',
    'uniform float exposure, bloom, vignette, saturation, contrast, lift;',
    'varying vec2 vUv;',
    'vec3 aces(vec3 x) {',
    '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);',
    '}',
    'vec3 toSRGB(vec3 c) {',
    '  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));',
    '}',
    'void main() {',
    '  vec3 c = texture2D(tScene, vUv).rgb;',
    '  c += texture2D(tBloom, vUv).rgb * bloom;',
    '  c *= exposure;',
    '  c = aces(c);',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(l), c, saturation);',
    '  c *= mix(vec3(0.93, 0.97, 1.07), vec3(1.07, 1.01, 0.90), smoothstep(0.15, 0.85, l));',
    '  c = (c - 0.5) * contrast + 0.5;',
    // trailing pedestal: opens the shadows back up so the frame stops reading
    // as glare against near-black, weighted so highlights are untouched
    '  c += lift * (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(c, 0.0, 1.0));',
    '  vec2 q = (vUv - 0.5) * vec2(1.0, 0.86);',
    '  c *= mix(1.0, smoothstep(0.95, 0.32, length(q)), vignette);',
    '  gl_FragColor = vec4(toSRGB(max(c, 0.0)), 1.0);',
    '}'
  ].join('\n'), {
    tScene: { value: null }, tBloom: { value: null },
    exposure: { value: 0.78 }, bloom: { value: 0.32 }, vignette: { value: 0.26 },
    saturation: { value: 1.18 }, contrast: { value: 1.07 }, lift: { value: 0.035 }
  });
  const isGL2 = renderer.capabilities.isWebGL2;
  let rtScene = null, rtA = null, rtB = null, enabled = settings.quality > 0;
  function makeRT(w, h, msaa) {
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    if (msaa && isGL2) { opts.samples = 4; return new THREE.WebGLMultisampleRenderTarget(w, h, opts); }
    return new THREE.WebGLRenderTarget(w, h, opts);
  }
  function dispose() {
    if (rtScene) rtScene.dispose();
    if (rtA) rtA.dispose();
    if (rtB) rtB.dispose();
    rtScene = rtA = rtB = null;
  }
  function setSize(w, h) {
    const pr = renderer.getPixelRatio();
    const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
    dispose();
    rtScene = makeRT(W, H, true);
    const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2);
    rtA = makeRT(bw, bh, false);
    rtB = makeRT(bw, bh, false);
  }
  function setEnabled(v) { enabled = v; }
  function render(sc, cam) {
    if (!enabled || !rtScene) { renderer.render(sc, cam); return; }
    renderer.setRenderTarget(rtScene);
    renderer.render(sc, cam);
    quad.material = brightMat;
    brightMat.uniforms.tDiffuse.value = rtScene.texture;
    renderer.setRenderTarget(rtA);
    renderer.render(fsScene, fsCam);
    quad.material = blurMat;
    blurMat.uniforms.tDiffuse.value = rtA.texture;
    blurMat.uniforms.dir.value.set(1 / rtA.width, 0);
    renderer.setRenderTarget(rtB);
    renderer.render(fsScene, fsCam);
    blurMat.uniforms.tDiffuse.value = rtB.texture;
    blurMat.uniforms.dir.value.set(0, 1 / rtA.height);
    renderer.setRenderTarget(rtA);
    renderer.render(fsScene, fsCam);
    quad.material = compMat;
    compMat.uniforms.tScene.value = rtScene.texture;
    compMat.uniforms.tBloom.value = rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(fsScene, fsCam);
  }
  return { setSize, setEnabled, render, get enabled() { return enabled; } };
})();

