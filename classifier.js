/* ============================================================
   FDCLS — 8-class food classifier, running locally in the browser.

   Model: MobileNetV3Small fine-tuned on 8 fridge staples, exported as
   food8_u8.tflite. Its input is uint8 precisely so MediaPipe can take it
   without NormalizationOptions metadata (a float32 input makes MediaPipe
   refuse the model, and the tfjs-tflite runtime needs COOP/COEP headers
   that GitHub Pages cannot send).

   Everything here is served from our own origin: no CDN, works offline,
   the photo never leaves the device.
   ============================================================ */
(function (g) {
  "use strict";

  const LABELS = ["chili", "egg", "greens", "milk", "mushroom", "pork", "tofu", "tomato"];
  const MODEL = "./models/food8_u8.tflite";
  const BUNDLE = "./vendor/mediapipe/vision_bundle.mjs";
  const WASM = "./vendor/mediapipe/wasm";

  let clf = null, loading = null, failed = null;

  async function ready() {
    if (clf) return clf;
    if (failed) throw failed;
    if (loading) return loading;
    loading = (async () => {
      const vision = await import(BUNDLE);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      const opts = delegate => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "IMAGE",
        maxResults: 3,
        scoreThreshold: 0
      });
      /* CPU by default: the GPU delegate repeatedly fails to Open on desktops and
         headless Chrome, and MobileNetV3Small is small enough that CPU is fast. */
      try {
        clf = await vision.ImageClassifier.createFromOptions(fileset, opts("CPU"));
      } catch (e) {
        clf = await vision.ImageClassifier.createFromOptions(fileset, opts("GPU"));
      }
      return clf;
    })().catch(e => { failed = e; loading = null; throw e; });
    return loading;
  }

  /* 224×224 centre-crop, pixels untouched — the model does its own rescaling */
  function prep(src) {
    const c = document.createElement("canvas");
    c.width = 224; c.height = 224;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const w = src.videoWidth || src.naturalWidth || src.width;
    const h = src.videoHeight || src.naturalHeight || src.height;
    const side = Math.min(w, h);
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 224, 224);
    return c;
  }

  async function classify(src) {
    const m = await ready();
    const res = m.classify(prep(src));
    const cats = (res.classifications && res.classifications[0] && res.classifications[0].categories) || [];
    const sorted = cats.slice().sort((a, b) => b.score - a.score);
    const top = sorted[0] || { index: -1, score: 0 };
    const sec = sorted[1] || { index: -1, score: 0 };
    return {
      index: top.index,
      label: LABELS[top.index] || "unknown",
      conf: top.score,
      second: LABELS[sec.index] || "unknown",
      conf2: sec.score,
      margin: top.score - sec.score
    };
  }

  /* Three frames, one answer. A single frame at 65% is a coin toss;
     two frames agreeing with a clear margin is a usable signal. */
  function vote(results) {
    if (!results || !results.length) return { ok: false, reason: "没有结果" };
    const tally = {};
    results.forEach(r => { tally[r.label] = (tally[r.label] || 0) + 1; });
    const ranked = Object.keys(tally).map(k => ({ label: k, votes: tally[k] })).sort((a, b) => b.votes - a.votes);
    const win = ranked[0];
    const confOf = lbl => {
      const rs = results.filter(r => r.label === lbl);
      return rs.reduce((s, r) => s + r.conf, 0) / (rs.length || 1);
    };
    const meanConf = confOf(win.label);
    const runnerUp = ranked[1] ? ranked[1].label : null;
    const secondConf = runnerUp ? confOf(runnerUp) : 0;
    const need = Math.ceil(results.length / 2);
    const ok = win.votes >= need && meanConf >= 0.45 && (meanConf - secondConf) >= 0.12;
    return {
      ok, label: win.label, votes: win.votes, total: results.length,
      conf: meanConf, second: runnerUp, conf2: secondConf,
      reason: !ok
        ? (win.votes < need ? "帧之间不一致" : meanConf < 0.45 ? "置信度不够" : "与第二名太接近")
        : "ok"
    };
  }

  g.FDCLS = { ready, classify, vote, LABELS, prep };
})(window);
