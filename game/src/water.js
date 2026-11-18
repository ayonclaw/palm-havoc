// The bay. One plane, subdivided, displaced by four travelling swells in the vertex shader, lit in
// the fragment shader with a fresnel sky reflection and the sun's own glitter path. The water is a
// quarter of every wide shot in this game, so it moves: crests run in from the horizon, the surf
// line breathes against the sand, and the sun lays a broken road of light across the swell.
import * as THREE from '../vendor/three.module.min.js';
import { OCEAN, SUN } from './config.js';

const VERTEX = `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  void main() {
    vec3 p = position;
    vec2 q = p.xz;
    float t = uTime;
    vec2 slope = vec2(0.0);
    float h = 0.0;

    // Five swells: a ground swell, two crossing seas, chop and ripple.
    vec2 k1 = vec2(0.029, 0.013); float a1 = 1.55; float w1 = 0.55;
    float p1 = dot(k1, q) + t * w1;
    h += a1 * sin(p1); slope += a1 * cos(p1) * k1;

    vec2 k2 = vec2(-0.017, 0.042); float a2 = 0.92; float w2 = 0.74;
    float p2 = dot(k2, q) + t * w2 + 1.7;
    h += a2 * sin(p2); slope += a2 * cos(p2) * k2;

    vec2 k3 = vec2(0.074, -0.051); float a3 = 0.34; float w3 = 1.45;
    float p3 = dot(k3, q) + t * w3 + 0.4;
    h += a3 * sin(p3); slope += a3 * cos(p3) * k3;

    vec2 k4 = vec2(0.19, 0.16); float a4 = 0.13; float w4 = 2.4;
    float p4 = dot(k4, q) + t * w4;
    h += a4 * sin(p4); slope += a4 * cos(p4) * k4;

    vec2 k5 = vec2(-0.41, 0.33); float a5 = 0.05; float w5 = 3.7;
    float p5 = dot(k5, q) + t * w5;
    h += a5 * sin(p5); slope += a5 * cos(p5) * k5;

    p.y += h;
    vHeight = h;
    vNormalW = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = `
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uHaze;
  uniform vec3 uCamera;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(uCamera - vWorld);
    vec3 L = normalize(uSun);

    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 4.0);

    // Shallow turquoise close to the sand, deep blue out in the bay.
    float offshore = 1.0 - smoothstep(-1250.0, -400.0, vWorld.z);
    vec3 body = mix(uShallow, uDeep, offshore);
    body *= 0.86 + 0.22 * clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
    vec3 colour = mix(body, uSky, fresnel * 0.26);

    // Swell lines: the bands of a running sea, readable from any height.
    float phaseA = dot(vWorld.xz, vec2(0.029, 0.013)) + uTime * 0.55;
    float phaseB = dot(vWorld.xz, vec2(-0.017, 0.042)) + uTime * 0.74 + 1.7;
    float bands = smoothstep(0.42, 0.98, sin(phaseA)) * 0.5 + smoothstep(0.55, 1.0, sin(phaseB)) * 0.3;
    colour += vec3(0.075, 0.145, 0.155) * bands;

    // The sun's road: the mirror direction has to point at the sun, and the swell breaks it up.
    vec3 R = reflect(-V, N);
    float align = clamp(dot(normalize(R), L), 0.0, 1.0);
    float road = pow(align, 9.0);
    float breakup = 0.58 + 0.42 * sin(dot(vWorld.xz, vec2(0.42, 0.31)) + uTime * 1.9)
      * sin(dot(vWorld.xz, vec2(-0.33, 0.57)) - uTime * 1.5);
    colour += uSunColor * road * (0.35 + 0.9 * breakup);

    vec2 jitter = vWorld.xz * 1.35;
    jitter += 0.6 * vec2(sin(jitter.y * 0.63 + 1.2), cos(jitter.x * 0.51 - 0.7));
    mat2 spin = mat2(0.87, -0.49, 0.49, 0.87);
    vec2 cell = floor(spin * jitter) + floor(uTime * 2.2);
    float sparkle = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float near = 1.0 - smoothstep(300.0, 900.0, length(vWorld.xz - uCamera.xz));
    float sparks = smoothstep(0.9, 1.0, sparkle) * pow(align, 3.0) * near;
    colour += uSunColor * sparks * 1.45;

    // Warm bounce on the lit crests, and a thin lace of foam on the tallest ones.
    colour += vec3(0.13, 0.08, 0.04) * clamp(vHeight * 0.4 + 0.4, 0.0, 1.0);
    float crest = smoothstep(1.55, 2.1, vHeight);
    colour += vec3(0.62, 0.72, 0.74) * crest * 0.22;

    float reach = length(vWorld.xz - uCamera.xz);
    float haze = smoothstep(620.0, 1700.0, reach);
    colour = mix(colour, uHaze, haze * 0.48);

    // A filmic shoulder and display gamma: this material draws itself.
    colour = colour / (colour + vec3(1.15)) * 1.92;
    colour = pow(clamp(colour, 0.0, 1.0), vec3(0.4545));
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** Build the bay surface and hand back the tick that drives it. */
export function buildWater(parent) {
  const width = 3000;
  const depth = 1500;
  const geometry = new THREE.PlaneGeometry(width, depth, 190, 96);
  geometry.rotateX(-Math.PI / 2);

  const sun = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: sun },
      uSunColor: { value: new THREE.Vector3(1.0, 0.84, 0.62) },
      uDeep: { value: new THREE.Vector3(0.010, 0.070, 0.155) },
      uShallow: { value: new THREE.Vector3(0.055, 0.285, 0.335) },
      uSky: { value: new THREE.Vector3(0.62, 0.76, 0.86) },
      uHaze: { value: new THREE.Vector3(0.80, 0.72, 0.60) },
      uCamera: { value: new THREE.Vector3(0, 40, -500) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, OCEAN.level, OCEAN.beachEnd - depth / 2 + 14);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  parent.add(mesh);

  // The surf line: a pale band that leans against the sand and breathes.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 11),
    new THREE.MeshBasicMaterial({
      color: 0xf4fbfc, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, OCEAN.level + 0.42, OCEAN.beachEnd + 4);
  parent.add(foam);

  const second = foam.clone();
  second.material = foam.material.clone();
  second.material.opacity = 0.34;
  parent.add(second);

  return {
    mesh,
    material,
    /** The shader needs the eye every frame: haze and glitter both depend on where it stands. */
    setCamera(position) {
      if (position) material.uniforms.uCamera.value.copy(position);
    },
    tick(dt, time, cameraPosition) {
      material.uniforms.uTime.value = time;
      if (cameraPosition) material.uniforms.uCamera.value.copy(cameraPosition);
      const surge = Math.sin(time * 0.62);
      foam.position.z = OCEAN.beachEnd + 4 + surge * 3.2;
      foam.material.opacity = 0.5 + surge * 0.16;
      second.position.z = OCEAN.beachEnd + 14 + Math.sin(time * 0.47 + 1.9) * 5.0;
      second.material.opacity = 0.22 + Math.sin(time * 0.47 + 1.9) * 0.1;
    },
  };
}
