// Ruido y utilidades para los shaders de "Hecha de luz".
// Ojo: el fbm por píxel se usa SOLO al hornear las nubes (una vez, al cargar). En cada cuadro los
// shaders solo leen texturas ya horneadas.
export const HASH = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
`;

// ruido de valor 3D suave (para el horneado de nubes)
export const NOISE3 = /* glsl */`
${HASH}
float vnoise3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), g = hash13(i + vec3(1,0,1)), h = hash13(i + vec3(0,1,1)), k = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm3(vec3 p, int oct){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; v += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
// "billow": ruido con crestas redondeadas, como el algodón de los cúmulos
float billow3(vec3 p, int oct){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; v += a * abs(vnoise3(p) * 2.0 - 1.0); p = p * 2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; }
  return v;
}
`;
