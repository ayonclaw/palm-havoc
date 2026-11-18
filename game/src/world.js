// The stage: renderer, sky dome, sun, haze and the resize handling. Everything that is not the
// city, the walker or the car lives here.
import * as THREE from '../vendor/three.module.min.js';
import { COLORS, WORLD, CAMERA, SUN } from './config.js';

/** A colour as raw sRGB components, handed to the sky shader untouched. */
function srgbColor(hex) {
  return new THREE.Vector3(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  );
}

const SKY_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDirection = world.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 horizonColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    float height = clamp(dir.y, 0.0, 1.0);
    float band = pow(1.0 - height, 2.1);
    vec3 color = mix(topColor, midColor, smoothstep(0.0, 0.6, band));
    color = mix(color, horizonColor, smoothstep(0.55, 1.0, band));
    color = mix(color, horizonColor * 0.92, smoothstep(0.02, -0.22, dir.y));

    float sun = max(dot(dir, normalize(sunDirection)), 0.0);
    color += sunColor * pow(sun, 320.0) * 3.2;
    color += sunColor * pow(sun, 6.0) * 0.30;
    color += sunColor * pow(sun, 2.0) * 0.06;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.haze, WORLD.fogNear, WORLD.fogFar);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.15, 3200);
  camera.position.set(0, 6, 20);

  const sunDirection = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: srgbColor(COLORS.skyTop) },
        midColor: { value: srgbColor(COLORS.skyMid) },
        horizonColor: { value: srgbColor(COLORS.horizon) },
        sunColor: { value: srgbColor(COLORS.sunDisc) },
        sunDirection: { value: sunDirection },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(46, 24, 16),
    new THREE.MeshBasicMaterial({ color: COLORS.sunDisc, fog: false }),
  );
  sunDisc.position.copy(sunDirection).multiplyScalar(1300);
  scene.add(sunDisc);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdca8, transparent: true, opacity: 0.16, fog: false, depthWrite: false }),
  );
  sunGlow.position.copy(sunDirection).multiplyScalar(1290);
  scene.add(sunGlow);

  const sunLight = new THREE.DirectionalLight(0xffe0b2, 4.6);
  sunLight.position.copy(sunDirection).multiplyScalar(240);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(WORLD.shadowMapSize, WORLD.shadowMapSize);
  sunLight.shadow.camera.left = -WORLD.shadowRadius;
  sunLight.shadow.camera.right = WORLD.shadowRadius;
  sunLight.shadow.camera.top = WORLD.shadowRadius;
  sunLight.shadow.camera.bottom = -WORLD.shadowRadius;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 780;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.42;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // The bounce: warm light coming back off the sand and the water, so shade is not dead grey.
  const bounce = new THREE.DirectionalLight(0xff9c62, 0.62);
  bounce.position.set(-SUN.x * 120, 26, -SUN.z * 120);
  scene.add(bounce);

  const hemi = new THREE.HemisphereLight(0x9dc6ff, 0xff9a5e, 0.44);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffdcc0, 0.12));

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  /** Keep the shadow box and the sky dome centred on whoever the camera is following. */
  const follow = (position) => {
    sunLight.position.copy(position).addScaledVector(sunDirection, 230);
    sunLight.target.position.copy(position);
    sunLight.target.updateMatrixWorld();
    sky.position.set(position.x, 0, position.z);
    sunDisc.position.copy(sunDirection).multiplyScalar(1300).add(new THREE.Vector3(position.x, 0, position.z));
    sunGlow.position.copy(sunDirection).multiplyScalar(1290).add(new THREE.Vector3(position.x, 0, position.z));
  };

  const render = () => renderer.render(scene, camera);

  return { renderer, scene, camera, sunLight, sky, resize, follow, render, sunDirection };
}
