import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---- 武器のマテリアル ----
export function createWeaponMats(renderer: THREE.WebGLRenderer) {
  // 黒光りさせるための映り込み用環境マップ（武器のマテリアルだけに使う）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  return {
    // クナイ: 単色の黒 + 面ごとの陰影だけで見せるシンプルな質感。剣の刃、鎖鎌・斧の金属もこれ
    kunai: new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.6,
      roughness: 0.3,
      envMap,
      envMapIntensity: 1.2,
      flatShading: true,
    }),
    // リボルバー: 金属部分は暗いグレー、グリップはざらついたゴム
    gun: new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      metalness: 0.5,
      roughness: 0.45,
      envMap,
      envMapIntensity: 0.8,
      flatShading: true,
    }),
    grip: new THREE.MeshStandardMaterial({ color: 0x2e2e2e, metalness: 0, roughness: 0.85, flatShading: true }),
    bore: new THREE.MeshBasicMaterial({ color: 0x050505 }), // 銃口や薬室の穴（敵の拳銃と共通）
    flute: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.5, flatShading: true }),
    // 弾
    brass: new THREE.MeshStandardMaterial({
      color: 0xb08a3c,
      metalness: 0.8,
      roughness: 0.35,
      envMap,
      flatShading: true,
    }),
    lead: new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.3, roughness: 0.6, flatShading: true }),
    loader: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.2, roughness: 0.6, flatShading: true }),
    // 敵の自動拳銃
    pistol: new THREE.MeshStandardMaterial({ color: 0x4a4a4a, metalness: 0.15, roughness: 0.7, flatShading: true }),
    pistolDark: new THREE.MeshStandardMaterial({ color: 0x262626, metalness: 0.1, roughness: 0.8, flatShading: true }),
    // 剣の柄（鎖鎌の柄も同じ色）
    swordHilt: new THREE.MeshStandardMaterial({ color: 0x3b444c, metalness: 0.3, roughness: 0.7, flatShading: true }),
    // 鎖鎌の握りの巻き（斧の柄も同じ色）。一段暗くする
    sickleWrap: new THREE.MeshStandardMaterial({ color: 0x23282d, metalness: 0.1, roughness: 0.9, flatShading: true }),
  };
}
export type WeaponMats = ReturnType<typeof createWeaponMats>;
