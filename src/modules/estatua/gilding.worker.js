// Worker: calcula normales suavizadas, aStatue y aCurv del modelo fuera del hilo principal
// (antes eran ~90 ms trabados al cargar el modelo detallado). Ver gilding-bake.js.
import { bake } from './gilding-bake.js';

self.onmessage = (e) => {
  const { id, pos, index, toStatue, smooth } = e.data;
  const out = bake({ pos, index, toStatue, smooth });
  self.postMessage({ id, ...out }, [out.normal.buffer, out.aStatue.buffer, out.aCurv.buffer]);
};
