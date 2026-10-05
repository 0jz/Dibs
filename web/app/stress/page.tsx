"use client";

import { useEffect, useRef, useState } from "react";

// Heavy fragment shader: iterated domain-warped noise. Rendered at a fixed resolution
// so the score doesn't depend on window size.
const FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uRes;
out vec4 outColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 p = uv * 3.0;
  float a = 0.0, amp = 0.5;
  for (int i = 0; i < 96; i++) {
    p += vec2(noise(p + uTime * 0.3), noise(p.yx - uTime * 0.2)) * 0.35;
    a += amp * noise(p * 1.7);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 1.02;
    amp *= 0.985;
  }
  vec3 col = mix(vec3(0.04, 0.04, 0.06), vec3(0.96, 0.65, 0.14), smoothstep(8.0, 14.0, a));
  col = mix(col, vec3(0.38, 0.65, 0.98), smoothstep(14.0, 18.0, a) * 0.6);
  outColor = vec4(col, 1.0);
}`;

// Bandwidth load: dependent reads across a large texture. This is the memory-wear
// signal a mining run would show, capped at a short duration, with no miner.
const MEM_FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform sampler2D uTex;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float acc = 0.0;
  vec2 p = uv;
  for (int i = 0; i < 48; i++) {
    p += texture(uTex, fract(p * 1.37 + uTime * 0.01)).rg * 0.25;
    acc += texture(uTex, fract(p)).r;
  }
  outColor = vec4(fract(acc), uv.x, uv.y, 1.0);
}`;

const VERT = `#version 300 es
in vec2 pos; void main(){ gl_Position = vec4(pos, 0.0, 1.0); }`;

type State = "running" | "done" | "error";

type BatteryManager = { level: number };

function batteryLevel() {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (!nav.getBattery) return Promise.resolve(null);
  return nav.getBattery().then((b) => Math.round(b.level * 100)).catch(() => null);
}

export default function StressPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("running");
  const [error, setError] = useState("");
  const [renderer, setRenderer] = useState("");
  const [fps, setFps] = useState(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const code = qs.get("code") ?? "";
    const profile = qs.get("profile") === "phone" ? "phone" : "pc";
    const mode = qs.get("mode") === "memory" ? "memory" : "core";
    const requested = Number(qs.get("seconds")) || (mode === "memory" ? 20 : 45);
    const cap = profile === "phone" ? (mode === "memory" ? 25 : 20) : mode === "memory" ? 30 : 90;
    const seconds = Math.min(cap, Math.max(5, requested));
    const width = profile === "phone" ? 1280 : 1920;
    const height = profile === "phone" ? 720 : 1080;
    if (title.current) {
      title.current.textContent = profile === "phone"
        ? (mode === "memory" ? "Dibs phone endurance" : "Dibs phone stress")
        : mode === "memory" ? "Dibs VRAM bandwidth" : "Dibs GPU stress";
    }

    const c = canvas.current!;
    c.width = width;
    c.height = height;
    const gl = c.getContext("webgl2", { powerPreference: "high-performance", antialias: false });
    if (!gl) {
      setState("error");
      setError("WebGL2 is not available in this browser.");
      return;
    }

    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    setRenderer(rendererName);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, mode === "memory" ? MEM_FRAG : FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    } catch (e) {
      setState("error");
      setError(String(e));
      return;
    }
    if (mode === "memory") {
      const size = profile === "phone" ? 1024 : 2048;
      const pixels = new Uint8Array(size * size * 4);
      for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17) & 255;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "uTime");
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), c.width, c.height);
    gl.viewport(0, 0, c.width, c.height);

    // Draw several full-screen passes per animation frame so a fast GPU isn't capped
    // by the display refresh rate. Passes per second is the score.
    let passes = 1;
    let frames = 0;
    let raf = 0;
    let cancelled = false;
    const start = performance.now();
    let last = start;
    let windowStart = start;
    let windowFrames = 0;
    let stopForHeat = false;
    let lastPoll = 0;
    let batteryStart: number | null = null;
    batteryLevel().then((pct) => {
      batteryStart = pct;
    });

    let finished = false;
    const finish = async (aborted: boolean) => {
      if (finished) return;
      finished = true;
      const elapsed = Math.max(0.1, (performance.now() - start) / 1000);
      const batteryEnd = await batteryLevel();
      const score = {
        fps: Math.round(frames / elapsed),
        frames,
        renderer: rendererName,
        mode,
        profile,
        aborted,
        batteryStartPct: batteryStart,
        batteryEndPct: batteryEnd,
      };
      setFps(score.fps);
      setState("done");
      if (code) {
        fetch(`/api/agent/${code}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "gpuScore", gpuScore: score }),
        }).catch(() => {});
      }
    };

    const tick = (now: number) => {
      if (cancelled) return;
      if (stopForHeat) {
        finish(true);
        return;
      }
      const dt = now - last;
      last = now;
      if (dt < 20 && passes < 64) passes++;
      else if (dt > 40 && passes > 1) passes--;

      for (let i = 0; i < passes; i++) {
        gl.uniform1f(uTime, (now - start) / 1000 + i * 0.01);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      frames += passes;
      windowFrames += passes;

      if (now - windowStart > 1000) {
        setFps(Math.round((windowFrames * 1000) / (now - windowStart)));
        windowStart = now;
        windowFrames = 0;
        if (code && now - lastPoll > 2000) {
          lastPoll = now;
          fetch(`/api/agent/${code}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((body) => {
              if (body?.abort) stopForHeat = true;
            })
            .catch(() => {});
        }
      }
      const elapsed = (now - start) / 1000;
      setLeft(Math.max(0, Math.ceil(seconds - elapsed)));

      if (elapsed >= seconds) {
        finish(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="absolute left-6 top-6 rounded-xl border border-white/10 bg-black/70 px-5 py-4 backdrop-blur">
        <div ref={title} className="text-xs uppercase tracking-[0.2em] text-amber-300">Dibs load test</div>
        {state === "error" ? (
          <div className="mt-2 text-red-400">{error}</div>
        ) : (
          <>
            <div className="mt-2 text-4xl font-semibold tabular-nums text-white">{fps} <span className="text-base text-zinc-400">fps</span></div>
            <div className="mt-1 text-sm text-zinc-400">
              {state === "done" ? "Done — results sent. You can close this tab." : `${left}s left · keep this window in front`}
            </div>
            <div className="mt-2 max-w-md truncate text-xs text-zinc-500" title={renderer}>{renderer}</div>
          </>
        )}
      </div>
    </main>
  );
}
