import { TORSOS, STATUE } from './config.js';
import { loadGlb, smooth } from './models.js';

const GOLD_HI = '#F1D27A';

// Ruido de valor 3D para el shader de los torsos
const NOISE = /* glsl */ `
float fHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float fNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fHash(i),fHash(i+vec3(1,0,0)),f.x),mix(fHash(i+vec3(0,1,0)),fHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(fHash(i+vec3(0,0,1)),fHash(i+vec3(1,0,1)),f.x),mix(fHash(i+vec3(0,1,1)),fHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

// Contacto: la estatua baja y aparecen dos torsos de mármol partidos en diagonal, que el metal
// se va comiendo desde el corte, con fisuras grises que suben por el cuerpo. Cada torso son dos
// mitades (mallas) con el mismo material; se separan un poco al terminar de construirse.
//   1) torso de la Victoria: se recorta del modelo de la estatua cuando está cargado.
//   2) torso de la "segunda figura": viene en torso-2.glb.
export function createTorsos(ctx, { statue }) {
  const { THREE, root, shared } = ctx;
  const torsos = [];

  function makeTorso(geom, cfg) {
    const group = new THREE.Group();
    group.name = cfg.name;
    group.visible = false;
    root.add(group);
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const normal = new THREE.Vector3(...cfg.normal).normalize();
    const uniforms = {
      uBuild: { value: 0 }, uEat: { value: 0.3 }, uTime: { value: 0 }, uCrack: { value: 0 },
      uYMin: { value: bb.min.y }, uYMax: { value: bb.max.y },
      uN: { value: normal }, uOff: { value: cfg.cutY * (bb.max.y - bb.min.y) },
      uSilver: { value: cfg.silver }, uSeed: { value: cfg.seed },
      uIvory: { value: new THREE.Color('#EDE6DA') }, uMetal: { value: new THREE.Color(cfg.metal) },
      uCrackCol: { value: new THREE.Color('#5E636B') }, uGold: { value: new THREE.Color(GOLD_HI) },
    };

    // side = +1 / -1: de qué lado del corte diagonal se queda cada mitad
    function makeMaterial(side) {
      const mat = new THREE.MeshPhysicalMaterial({ color: '#EDE6DA', roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 2.2, side: THREE.DoubleSide });
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, { uSide: { value: side } });
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj=position;\n');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
varying vec3 vObj;
uniform float uBuild,uEat,uTime,uCrack,uYMin,uYMax,uSide,uOff,uSilver,uSeed;
uniform vec3 uN,uIvory,uMetal,uCrackCol,uGold;
${NOISE}
float gMetal=0.0, gRim=0.0, gPen=0.0, gCut=0.0, gPlane=0.0, gCrack=0.0, gSilv=0.0;
float crackLine(vec3 p, float w){ float v=fNoise(p); float d=abs(v-0.5); float fw=fwidth(v)*1.3+1e-4; return 1.0-smoothstep(w, w+fw, d); }`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  vec3 q = vObj + uSeed;
  float sd = dot(vObj - vec3(0.0,uOff,0.0), uN);
  if (sd*uSide < 0.0) discard;                           // corte diagonal (cada mitad su lado)
  float hN = (vObj.y-uYMin)/(uYMax-uYMin);
  float bn = (fNoise(q*14.0)-0.5)*0.08;
  if (hN > uBuild+bn) discard;                           // se construye de abajo hacia arriba
  gPen = (1.0-smoothstep(0.0,0.025,abs(hN-uBuild-bn))) * step(uBuild,0.999);
  gPlane = abs(sd);
  float n1 = fNoise(q*5.0+vec3(0.0,uTime*0.04,0.0))*0.62 + fNoise(q*13.0)*0.38;
  float eat = n1 - (uEat - gPlane*1.6);                  // el metal avanza desde el corte y se come el marfil
  gMetal = 1.0-smoothstep(-0.015,0.015,eat);
  gRim = 1.0-smoothstep(0.0,0.045,abs(eat));
  // vetas plateadas finas sobre el marfil (más en la segunda figura)
  gSilv = crackLine(q*vec3(16.0,5.0,16.0)+7.3, 0.012) * step(0.45, fNoise(q*3.0+1.7)) * uSilver * (1.0-gMetal);
  // fisuras grises que suben por el cuerpo: líneas estiradas en vertical + ramas
  float front = uCrack*1.12 - 0.06 + (fNoise(q*6.0)-0.5)*0.14;
  float up = 1.0 - smoothstep(front-0.03, front, hN);
  float c1 = crackLine(q*vec3(9.0,2.6,9.0), 0.018);
  float c2 = crackLine(q*vec3(20.0,7.0,20.0)+3.1, 0.014) * step(0.5, fNoise(q*4.0+9.0));
  gCrack = max(c1, c2*0.85) * up;
  gCut = gl_FrontFacing ? 0.0 : 1.0;
}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(uIvory, uMetal, gMetal);
diffuseColor.rgb = mix(diffuseColor.rgb, uMetal*1.08, gSilv);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16,0.15,0.14), gRim*0.75*(1.0-gMetal*0.4));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(uCrackCol, uCrackCol*0.55, gMetal), gCrack*0.9);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06,0.065,0.07), gCut);
`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(mix(mix(0.42,0.3,gMetal),0.22,gSilv),0.6,gCrack);
roughnessFactor = mix(roughnessFactor,0.38,gCut);
`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = max(max(gMetal*0.9, gSilv*0.95)*(1.0-gCrack*0.7), gCut*0.8);
`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uGold*(gPen*1.4 + gCut*smoothstep(0.035,0.0,gPlane)*1.2 + gRim*0.08*(1.0-gCut));
`);
      };
      return mat;
    }

    const matA = makeMaterial(1);
    const matB = makeMaterial(-1);
    const halfA = new THREE.Mesh(geom, matA);
    const halfB = new THREE.Mesh(geom, matB);
    [halfA, halfB].forEach((m) => { m.castShadow = true; m.frustumCulled = false; });
    const inner = new THREE.Group();
    inner.rotation.y = cfg.yaw;
    inner.add(halfA, halfB);
    group.add(inner);
    const height = bb.max.y - bb.min.y;

    return {
      group,
      /** w = peso de la sección Contacto (0..1) · e = descenso de la estatua (0..1) · spinAngle: giro con el mouse */
      update(t, w, e, portrait, spinAngle, dragging) {
        group.visible = w > 0.005;
        group.scale.setScalar((portrait ? cfg.sizeM : cfg.size) / height);
        const p = portrait ? cfg.posM : cfg.pos;
        group.position.set(p[0], p[1] - (1 - e) * 0.6, p[2]);
        group.rotation.y = t * cfg.spin + cfg.seed + spinAngle + (shared.pointer.x || 0) * 0.12 * (dragging ? 0 : 1);
        group.rotation.x = -(shared.pointer.y || 0) * 0.05;
        const k = smooth(cfg.delay, cfg.delay + 0.6, w);
        uniforms.uBuild.value = smooth(0.1, 0.85, k);
        uniforms.uEat.value = cfg.eat + 0.4 * smooth(0.4, 1, k) + Math.sin(t * 0.25 + cfg.seed) * 0.03;
        uniforms.uTime.value = t;
        uniforms.uCrack.value = smooth(0.55, 1, k) * (0.82 + 0.18 * Math.sin(t * 0.12 + cfg.seed));
        const gap = cfg.gap * smooth(0.7, 1, k); // al terminar, las dos mitades se separan
        halfA.position.copy(normal).multiplyScalar(gap);
        halfB.position.copy(normal).multiplyScalar(-gap);
        halfA.rotation.z = cfg.tilt * smooth(0.7, 1, k);
      },
      dispose() {
        geom.dispose();
        matA.dispose();
        matB.dispose();
        group.removeFromParent();
      },
    };
  }

  // 1) torso de la Victoria: triángulos de la zona del pecho del modelo de la estatua
  function buildVictoriaTorso() {
    const cfg = TORSOS.victoria;
    let mesh = null, best = 0;
    statue.floatGroup.traverse((o) => {
      if (o.isMesh && o.geometry.attributes.aStatue) {
        const n = o.geometry.attributes.position.count;
        if (n > best) { best = n; mesh = o; }
      }
    });
    if (!mesh) return;
    const g = mesh.geometry;
    const S = g.attributes.aStatue;
    const idx = g.index ? g.index.array : null;
    const triCount = idx ? idx.length / 3 : S.count / 3;
    const [AX, AZ] = cfg.cut.axis;
    const [Y0, Y1] = cfg.cut.y;
    const RAD = cfg.cut.radius;
    const keep = [];
    const remap = new Int32Array(S.count).fill(-1);
    const pos = [];
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const y = (S.getY(a) + S.getY(b) + S.getY(c)) / 3;
      if (y < Y0 || y > Y1) continue;
      const x = (S.getX(a) + S.getX(b) + S.getX(c)) / 3 - AX;
      const z = (S.getZ(a) + S.getZ(b) + S.getZ(c)) / 3 - AZ;
      // el radio se ensancha en los hombros y se cierra en el cuello
      const rr = RAD * (1 + 0.14 * smooth(2.15, 2.4, y) - 0.45 * smooth(2.48, 2.6, y));
      if (x * x + z * z > rr * rr) continue;
      for (const v of [a, b, c]) {
        if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(S.getX(v), S.getY(v), S.getZ(v)); }
        keep.push(remap[v]);
      }
    }
    if (keep.length < 300) return;
    let ymin = Infinity, ymax = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < pos.length; i += 3) {
      ymin = Math.min(ymin, pos[i + 1]);
      ymax = Math.max(ymax, pos[i + 1]);
      cx += pos[i];
      cz += pos[i + 2];
    }
    const n = pos.length / 3;
    cx /= n; cz /= n;
    const cy = (ymin + ymax) / 2;
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz; }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setIndex(keep);
    geom.computeVertexNormals();
    torsos.push(makeTorso(geom, { ...cfg, yaw: STATUE.rotationY + 0.15 }));
  }
  // resuelve cuando el torso ya está construido (no antes)
  const readyVictoria = new Promise((done) => {
    (statue.ready || Promise.resolve()).then(() => setTimeout(() => { try { buildVictoriaTorso(); } finally { done(); } }, 50)).catch(done);
  });

  // 2) torso de la segunda figura
  const cfg2 = TORSOS.figura;
  const readyFigura = loadGlb(ctx, cfg2.model)
    .then((gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', mesh.geometry.attributes.position);
      if (mesh.geometry.index) geom.setIndex(mesh.geometry.index);
      geom.computeVertexNormals();
      torsos.push(makeTorso(geom, cfg2));
    })
    .catch((e) => console.warn('[contacto] no se pudo cargar el segundo torso', e));
  const ready = Promise.all([readyVictoria, readyFigura]);

  return {
    ready,
    update(t, w, e, portrait, spinAngle, dragging) { torsos.forEach((x) => x.update(t, w, e, portrait, spinAngle, dragging)); },
    dispose() { torsos.forEach((x) => x.dispose()); },
  };
}
