import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/garden-model.glb`;
const KALKSTEIN = 0xe8e3d9;
const MAX_PIXEL_RATIO = 2;
const TURN_SPEED = 0.06;
const TILT_RANGE = 0.08;
const TILT_EASING = 0.05;
const FOV = 30;

function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setClearColor(KALKSTEIN);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}

function createLights(radius: number): Object3D[] {
  const sky = new HemisphereLight(0xf4f1ea, 0x5d6b58, 1.8);
  const sun = new DirectionalLight(0xfff4e2, 2.4);
  sun.position.set(radius * 0.8, radius * 1.4, radius * 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 3;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -radius;
  shadowCamera.right = shadowCamera.top = radius;
  shadowCamera.far = radius * 4;
  return [sky, sun];
}

function centerModel(model: Object3D): number {
  model.traverse((node) => {
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  return box.getSize(new Vector3()).length() / 2;
}

export async function mountGardenScene(frame: HTMLElement): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  frame.append(canvas);

  try {
    const renderer = createRenderer(canvas);
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);

    const radius = centerModel(gltf.scene);
    const pivot = new Group().add(gltf.scene);

    const scene = new Scene();
    scene.fog = new Fog(new Color(KALKSTEIN), radius * 3.4, radius * 6);
    scene.add(pivot, ...createLights(radius));

    const camera = new PerspectiveCamera(FOV, 1, 0.1, radius * 10);
    camera.position.set(0, radius * 1.05, radius * 1.95);
    camera.lookAt(0, 0, 0);

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = frame;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(frame);
    resize();

    const tilt = { current: 0, target: 0 };
    frame.addEventListener('pointermove', (event) => {
      const rect = frame.getBoundingClientRect();
      tilt.target = ((event.clientY - rect.top) / rect.height - 0.5) * TILT_RANGE;
    });
    frame.addEventListener('pointerleave', () => {
      tilt.target = 0;
    });

    let isVisible = true;
    new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? false;
    }).observe(frame);

    const timer = new Timer();
    renderer.setAnimationLoop((time: number) => {
      timer.update(time);
      if (!isVisible) return;
      pivot.rotation.y += TURN_SPEED * timer.getDelta();
      tilt.current += (tilt.target - tilt.current) * TILT_EASING;
      pivot.rotation.x = tilt.current;
      renderer.render(scene, camera);
    });

    requestAnimationFrame(() => frame.classList.add('is-ready'));
  } catch (error) {
    canvas.remove();
    throw error;
  }
}
