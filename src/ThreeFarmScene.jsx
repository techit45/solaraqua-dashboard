import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const RICE_PLANT_ASSET_PATH = "/models/rice-plant/";

function tuneRiceMaterial(material) {
  const tuned = material.clone();
  tuned.side = THREE.DoubleSide;

  if (tuned.name?.toLowerCase().includes("leaves")) {
    tuned.color.set(0x73813a);
    tuned.emissive?.set(0x111d09);
  } else {
    tuned.color.set(0xd6ca8b);
    tuned.emissive?.set(0x171407);
  }

  if ("roughness" in tuned) tuned.roughness = 0.86;
  if ("metalness" in tuned) tuned.metalness = 0.02;
  return tuned;
}

function prepareRicePlantModel(object) {
  const plant = object.clone(true);

  plant.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = Array.isArray(child.material)
      ? child.material.map(tuneRiceMaterial)
      : tuneRiceMaterial(child.material);
  });

  plant.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(plant);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const targetHeight = 3.18;
  const normalizedScale = targetHeight / Math.max(sourceSize.y, 1);
  plant.scale.setScalar(normalizedScale);
  plant.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(plant);
  const center = box.getCenter(new THREE.Vector3());
  plant.position.set(-center.x, -box.min.y, -center.z);
  plant.updateMatrixWorld(true);

  return plant;
}

function addRicePlantInstances(root, sourcePlant) {
  const host = root.userData.riceHost;
  if (!host) return;

  host.clear();
  const placements = [
    { position: [0, -0.08, 0], rotation: -0.24, scale: 1.12 },
    { position: [-0.98, -0.1, 0.62], rotation: 0.56, scale: 0.82 },
    { position: [1.05, -0.1, 0.54], rotation: -0.82, scale: 0.78 },
    { position: [-1.74, -0.12, -0.34], rotation: 1.16, scale: 0.62 },
    { position: [1.86, -0.12, -0.38], rotation: -1.34, scale: 0.58 },
    { position: [-0.28, -0.14, -0.98], rotation: 2.08, scale: 0.52 },
  ];

  root.userData.ricePlants = placements.map((placement) => {
    const plant = sourcePlant.clone(true);
    plant.position.set(...placement.position);
    plant.rotation.y = placement.rotation;
    plant.scale.multiplyScalar(placement.scale);
    host.add(plant);
    return plant;
  });
}

function loadRicePlantModel(root, isDisposed = () => false) {
  const manager = new THREE.LoadingManager();
  const materialLoader = new MTLLoader(manager).setPath(RICE_PLANT_ASSET_PATH);

  materialLoader.load(
    "RicePlant.mtl",
    (materials) => {
      if (isDisposed()) return;
      materials.preload();
      const objLoader = new OBJLoader(manager).setMaterials(materials).setPath(RICE_PLANT_ASSET_PATH);
      objLoader.load(
        "RicePlant.obj",
        (object) => {
          if (isDisposed()) return;
          const plant = prepareRicePlantModel(object);
          addRicePlantInstances(root, plant);
        },
        undefined,
        (error) => {
          console.warn("Unable to load RicePlant.obj", error);
        },
      );
    },
    undefined,
    (error) => {
      console.warn("Unable to load RicePlant.mtl", error);
    },
  );
}

function createRiceModel() {
  const root = new THREE.Group();
  const riceHost = new THREE.Group();
  root.add(riceHost);

  root.userData.riceHost = riceHost;
  root.userData.ricePlants = [];
  return root;
}

export default function ThreeFarmScene({ className = "", nodes = [], sceneMode = "growth" }) {
  const mountRef = useRef(null);
  const modeRef = useRef(sceneMode);

  useEffect(() => {
    modeRef.current = sceneMode;
  }, [sceneMode]);

  useEffect(() => {
    if (!mountRef.current) return undefined;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 2.35, 6.6);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf6fff0, 0xc5d3aa, 2.35));
    const key = new THREE.DirectionalLight(0xffffff, 3.25);
    key.position.set(4, 6, 5);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.PointLight(0xb9f27a, 22, 8);
    rim.position.set(-3, 2.8, 2.4);
    scene.add(rim);

    const model = createRiceModel();
    model.position.y = -1.08;
    scene.add(model);
    let disposed = false;
    loadRicePlantModel(model, () => disposed);

    const scroll = { value: 0 };
    const pointer = { x: 0, y: 0 };
    const interaction = {
      dragging: false,
      dragRotation: 0,
      lastX: 0,
      pressX: 0,
      pressY: 0,
      pulse: 0,
      velocity: 0,
    };
    const startTime = performance.now();
    let frame = 0;

    const updateScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scroll.value = Math.min(1, Math.max(0, window.scrollY / max));
    };

    const updatePointer = (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;

      if (interaction.dragging) {
        const deltaX = event.clientX - interaction.lastX;
        interaction.dragRotation += deltaX * 0.012;
        interaction.velocity = deltaX * 0.0025;
        interaction.lastX = event.clientX;
      }
    };

    const handlePointerDown = (event) => {
      interaction.dragging = true;
      interaction.lastX = event.clientX;
      interaction.pressX = event.clientX;
      interaction.pressY = event.clientY;
      mount.classList.add("is-dragging");
    };

    const handlePointerUp = (event) => {
      if (!interaction.dragging) return;
      const moved = Math.hypot(event.clientX - interaction.pressX, event.clientY - interaction.pressY);
      if (moved < 8) interaction.pulse = 1;
      interaction.dragging = false;
      mount.classList.remove("is-dragging");
    };

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = scroll.value;
      const mode = modeRef.current;
      const modeRotation = mode === "breeze" ? 0.22 : mode === "inspect" ? 0.055 : 0.12;
      const modeScale = mode === "inspect" ? 1.2 : mode === "breeze" ? 1.08 : 1;
      const sway = mode === "breeze" ? 0.032 : 0.018;

      interaction.dragRotation += interaction.velocity;
      interaction.velocity *= 0.92;
      const pulseScale = interaction.pulse > 0 ? 1 + Math.sin(interaction.pulse * Math.PI) * 0.065 : 1;
      interaction.pulse = Math.max(0, interaction.pulse - 0.035);
      model.scale.setScalar(THREE.MathUtils.lerp(model.scale.x, modeScale * pulseScale, 0.055));

      model.rotation.y = elapsed * modeRotation + progress * Math.PI * 2.05 + pointer.x * 0.16 + interaction.dragRotation;
      model.rotation.x = -0.08 + pointer.y * 0.06 + Math.sin(elapsed * 0.8) * 0.018;
      model.position.y = -1.1 + Math.sin(elapsed * 0.9) * 0.035;
      camera.position.x = Math.sin(progress * Math.PI * 1.2) * 0.52;
      camera.position.y = 2.36 - progress * 0.2;
      camera.position.z = 6.15 - progress * 0.62;
      camera.lookAt(0, 1.05, 0);

      model.userData.ricePlants.forEach((plant, index) => {
        plant.rotation.z = Math.sin(elapsed * 1.18 + index * 0.9) * sway;
        plant.rotation.x = Math.cos(elapsed * 0.74 + index * 0.65) * sway * 0.42;
      });

      renderer.render(scene, camera);
    };

    resize();
    updateScroll();
    animate();

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    mount.addEventListener("pointerdown", handlePointerDown);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerup", handlePointerUp);
      mount.removeEventListener("pointerdown", handlePointerDown);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      scene.traverse((item) => {
        if (item.geometry) item.geometry.dispose();
        if (item.material) {
          if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
          else item.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  return <div className={`three-farm-scene ${className}`} ref={mountRef} />;
}
