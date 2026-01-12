import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOnnxServer } from "../hook/useOnnxServer";

type PacificPlaybackState = "idle" | "countdown" | "playing" | "paused";

type PacificPreviewState = {
  playbackState?: PacificPlaybackState;
  progress?: number;
  countdownLeftSec?: number;
  textOffset?: number;
  segmentIndex?: number;
  [k: string]: unknown;
};

type PacificPreviewInstance = {
  enter?: (config: unknown) => unknown;
  start?: () => unknown;
  pause?: () => unknown;
  stop?: () => unknown;
  exit?: () => unknown;
  patchConfig?: (patch: unknown) => unknown;
  onStateChange?: (cb: (state: PacificPreviewState) => void) => unknown;
  onError?: (cb: (err: unknown) => void) => unknown;
  feedASR?: (asrEvent: unknown) => unknown;
  isActive?: () => boolean;
  [k: string]: unknown;
};

type PacificEditorGlobal = {
  getPreviewInstance?: () => PacificPreviewInstance;
  preview?: PacificPreviewInstance;
  init?: (config: unknown) => unknown;
  [k: string]: unknown;
};

export const DemoPage: React.FC = () => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const noDragStyle = { WebkitAppRegion: "no-drag" as const };
  const {
    isConnected,
    isRecognizing,
    asrEvent,
    error,
    connect,
    startRecognition,
    stopRecognition,
    microphones,
    selectedDeviceId,
    selectMicrophone,
    refreshDevices,
  } = useOnnxServer({
    serverAddr: "localhost",
    serverPort: 6006,
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeStatus, setIframeStatus] = useState<string>("loading");
  const [previewState, setPreviewState] = useState<PacificPreviewState | null>(null);

  const [speed, setSpeed] = useState<number>(50);
  const [countdownSec, setCountdownSec] = useState<number>(3);
  const [themeOpacity, setThemeOpacity] = useState<number>(0.7);
  const [hasEntered, setHasEntered] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<"follow" | "constant" | null>(null);
  const [windowOpacity, setWindowOpacity] = useState<number | null>(null);

  const isIframeReady = iframeStatus === "preview_ready";
  const playbackState: PacificPlaybackState =
    (previewState?.playbackState as PacificPlaybackState) ?? "idle";

  const safeCall = (label: string, fn: unknown, ...args: unknown[]) => {
    if (typeof fn !== "function") {
      console.warn(`[DEMO] ❌ ${label} is not a function`);
      return;
    }
    try {
      return (fn as (...a: unknown[]) => unknown)(...args);
    } catch (e) {
      console.error(`[DEMO] ❌ ${label} threw`, e);
    }
  };

  const getPreviewInstance = useMemo(() => {
    return (): PacificPreviewInstance | null => {
      const iframe = iframeRef.current;
      if (!iframe) return null;
      const w = iframe.contentWindow as unknown as Record<string, unknown> | null;
      if (!w) return null;

      const editor = w["pacificEditor"] as PacificEditorGlobal | undefined;
      if (editor?.getPreviewInstance) {
        const inst = safeCall("editor.getPreviewInstance", editor.getPreviewInstance);
        if (inst) return inst as PacificPreviewInstance;
      }

      if (editor?.preview) return editor.preview;
      if (w["pacificPreview"]) return w["pacificPreview"] as PacificPreviewInstance;

      return null;
    };
  }, []);

  // iframe readiness + register preview listeners
  useEffect(() => {
    const checkIframe = () => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const w = iframe.contentWindow as unknown as Record<string, unknown> | null;
        if (!w) {
          setIframeStatus("iframe_not_accessible");
          return;
        }

        const editor = w["pacificEditor"] as PacificEditorGlobal | undefined;
        const legacyPreview = w["pacificPreview"] as PacificPreviewInstance | undefined;
        const preview = getPreviewInstance();

        if (editor || legacyPreview || preview) {
          setIframeStatus("preview_ready");

          const initialized = Boolean(w["__initialized"]);
          const listenerSet = Boolean(w["__previewListenerSet"]);

          // Optional init (only if editor exposes init)
          if (editor?.init && !initialized) {
            const initConfig = {
              note: {
                id: 289852,
                title: "ASR文本对齐默认文稿",
                content: `<!doctype html>
                  <html lang="zh-CN">
                  <head>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width,initial-scale=1" />
                    <title>ASR文本对齐默认文稿</title>
                  </head>
                  <body>
                    <h1>ASR文本对齐默认文稿</h1>
                    <p>核心挑战是在全文中找到 ASR 识别出的文本片段在原文中的位置。为此可以采用模糊匹配算法，允许一定错误和漏识别。</p>

                    <h2>动态规划的模糊匹配</h2>
                    <p>使用编辑距离（Levenshtein 距离）将 ASR 转录结果与原文候选位置进行比对。具体做法是：对每次新的 ASR 文本（尤其是 Final 结果）在原文中滑动窗口应用动态规划匹配，计算最小编辑距离，找出最可能的对齐位置。</p>
                    <p>例如 Lingua 系统会把 ASR 转录和脚本文本转换为音素序列，再用动态规划计算 Levenshtein 距离对齐当前识别串与候选脚本句子。通过允许插入、删除、替换操作，算法能容忍漏字、错字等识别误差，并找到误差最小的匹配路径。</p>
                    <p>为提高效率，可限制匹配窗口大小（例如只在当前光标附近的后续 N 个字符或词范围内搜索），避免整篇长文全文比较。匹配结果可用编辑距离归一化分数评分，并设置阈值判断是否达到可信匹配。该方法在字幕校准等领域已验证，即使识别准确率较低也能找到正确位置。</p>

                    <h2>基于锚点的快速匹配</h2>
                    <p>为提升实时匹配速度，可结合精确查找与模糊匹配。做法是从 ASR 输出片段中提取若干锚点子串（例如长度较长且不含空白的连续字词），尝试在原文有效字符序列中定位这些子串。</p>
                    <p>若找到唯一匹配位置，则可认为锚点对齐并据此推测整体位置；若存在多个候选或未找到，则退而使用编辑距离算法在局部范围内做细致匹配。这样利用精确字符串搜索（如 KMP）快速缩小候选区域，再对候选区域应用模糊匹配，可减少不必要的全局比较。</p>

                    <h2>音韵与同音匹配优化</h2>
                    <p>中文场景下 ASR 常出现同音字错误或简繁体差异。可以将文本和识别结果转换为拼音或音素序列再进行匹配，将同音错误视作匹配成功，从而提高容错。</p>
                    <p>例如将“你好”错识别为“尼豪”时，音素级匹配仍可对齐。需要注意音素级匹配会增加计算开销，可在识别错误率高或对准确性要求极高的场景中酌情使用。</p>

                    <h2>部分结果的增量匹配</h2>
                    <p>实时 ASR 的 partial 结果不断变化，可采用增量匹配策略。每次新的 partial 文本无需从头匹配完整片段，而是利用上一次匹配位置作为起点，仅对后续新增文本做匹配。</p>
                    <p>通常 ASR partial 是前缀逐渐扩展或仅修改尾部，因此可以假设新 partial 的大部分开头仍对齐于之前 final 确定的位置。这样既降低计算量，也避免 partial 瞬时波动导致的位置大跳变。</p>

                    <h2>建议方案</h2>
                    <p>综合来看，推荐以动态规划模糊匹配为主，实现鲁棒的文本对齐，并辅以锚点查找与增量优化提升性能。编辑距离阈值等参数需通过实验调优，以在准确率与性能之间取得平衡。</p>
                  </body>
                  </html>`,
              },
              preview: {
                isPreview: false,
                config: {
                  playback: {
                    mode: "follow",
                    speed: 50,
                    countdownSec: 0,
                    loop: false,
                    smartPause: false,
                  },
                  theme: {
                    opacity: themeOpacity,
                  },
                },
              },
            };

            safeCall("pacificEditor.init", editor.init, initConfig);
            w["__initialized"] = true;
          }

          if (preview && !listenerSet) {
            if (preview.onStateChange) {
              safeCall("preview.onStateChange", preview.onStateChange, (state: PacificPreviewState) => {
                setPreviewState(state);
              });
            }
            if (preview.onError) {
              safeCall("preview.onError", preview.onError, (err: unknown) => {
                console.error("[DEMO] preview error:", err);
              });
            }
            w["__previewListenerSet"] = true;
          }
        } else {
          setIframeStatus("preview_not_found");
        }
      } catch (e) {
        setIframeStatus("access_denied");
      }
    };

    checkIframe();
    const t = setInterval(checkIframe, 1500);
    return () => clearInterval(t);
  }, [getPreviewInstance]);

  useEffect(() => {
    const fetchOpacity = async () => {
      if (!window.electronAPI?.getWindowOpacity) return;
      try {
        const value = await window.electronAPI.getWindowOpacity();
        setWindowOpacity(value);
      } catch (e) {
        console.warn("[DEMO] failed to get window opacity", e);
      }
    };
    fetchOpacity();
  }, []);

  const patchWindowOpacity = async (next: number) => {
    setWindowOpacity(next);
    if (!window.electronAPI?.setWindowOpacity) return;
    try {
      const value = await window.electronAPI.setWindowOpacity(next);
      setWindowOpacity(value);
    } catch (e) {
      console.warn("[DEMO] failed to set window opacity", e);
    }
  };

  // Forward ASR to preview.feedASR only when entered
  useEffect(() => {
    if (!asrEvent || !hasEntered) return;
    const preview = getPreviewInstance();
    if (!preview?.feedASR) return;

    const isActive = typeof preview.isActive === "function" ? preview.isActive() : true;
    if (!isActive) return;

    safeCall("preview.feedASR", preview.feedASR, asrEvent);
  }, [asrEvent, getPreviewInstance, hasEntered]);

  const buildConstantConfig = (): unknown => ({
    playback: {
      mode: "constant",
      speed,
      countdownSec,
      loop: false,
    },
    theme: {
      fontSizePx: 40,
      fontColor: "#FFFFFF",
      backgroundColor: "#000000",
      opacity: themeOpacity,
    },
  });

  const buildFollowConfig = (): unknown => ({
    playback: {
      mode: "follow",
      speed,
      countdownSec,
      loop: false,
      smartPause: false,
    },
    theme: {
      opacity: themeOpacity,
    },
  });

  const enterConstant = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.enter", preview.enter, buildConstantConfig());
    setHasEntered(true);
    setActiveMode("constant");
  };

  const enterFollow = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.enter", preview.enter, buildFollowConfig());
    setHasEntered(true);
    setActiveMode("follow");
  };

  const startPreview = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.start", preview.start);
  };

  const pausePreview = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.pause", preview.pause);
  };

  const stopPreview = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.stop", preview.stop);
  };

  const exitPreview = () => {
    const preview = getPreviewInstance();
    if (!preview) return;
    safeCall("preview.exit", preview.exit);
    setHasEntered(false);
    setActiveMode(null);
  };

  const patchSpeed = (next: number) => {
    setSpeed(next);
    const preview = getPreviewInstance();
    if (!preview?.patchConfig) return;
    safeCall("preview.patchConfig", preview.patchConfig, { playback: { speed: next } });
  };

  const patchThemeOpacity = (next: number) => {
    setThemeOpacity(next);
    if (!hasEntered) return;
    const preview = getPreviewInstance();
    if (!preview?.patchConfig) return;
    safeCall("preview.patchConfig", preview.patchConfig, { theme: { opacity: next } });
  };

  const handleStart = async () => {
    if (!isConnected) await connect();

    if (isIframeReady) {
      if (!hasEntered) enterFollow();
      startPreview();
    }

    await startRecognition();
  };

  const handleStop = () => {
    stopRecognition();
    if (isIframeReady) {
      stopPreview();
      exitPreview();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <div
        style={{
          padding: "10px 20px",
          paddingLeft: isMac ? 76 : 20,
          background: "rgba(255, 255, 255, 0.6)",
          borderBottom: "1px solid #ddd",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          WebkitAppRegion: "drag",
        }}
      >
        <b>Preview Controls</b>

        <select
          value={selectedDeviceId ?? ""}
          onChange={async (e) => await selectMicrophone(e.target.value)}
          style={{ padding: 4, fontSize: 12, ...noDragStyle }}
        >
          {microphones.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
            </option>
          ))}
        </select>
        <button onClick={() => refreshDevices()} style={{ padding: "4px 8px", ...noDragStyle }}>
          🔄
        </button>

        <span style={{ fontSize: 12 }}>Speed</span>
        <input
          type="range"
          min={10}
          max={200}
          step={1}
          value={speed}
          onChange={(e) => patchSpeed(Number(e.target.value))}
          disabled={!isIframeReady || !hasEntered || activeMode !== "constant"}
          style={noDragStyle}
        />
        <span style={{ fontSize: 12, width: 60 }}>{speed}px/s</span>

        <span style={{ fontSize: 12 }}>Countdown</span>
        <input
          type="number"
          min={0}
          max={10}
          value={countdownSec}
          onChange={(e) => setCountdownSec(Number(e.target.value))}
          style={{ width: 56, padding: 4, fontSize: 12, ...noDragStyle }}
          disabled={!isIframeReady || hasEntered}
        />

        <span style={{ fontSize: 12, fontWeight: 600 }}>跟读</span>
        <button onClick={enterFollow} disabled={!isIframeReady || hasEntered} style={noDragStyle}>
          Enter
        </button>
        <button
          onClick={startPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "follow"}
          style={noDragStyle}
        >
          Start
        </button>
        <button
          onClick={pausePreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "follow"}
          style={noDragStyle}
        >
          Pause
        </button>
        <button
          onClick={stopPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "follow"}
          style={noDragStyle}
        >
          Stop
        </button>
        <button
          onClick={exitPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "follow"}
          style={noDragStyle}
        >
          Exit
        </button>

        <span style={{ fontSize: 12, fontWeight: 600 }}>匀速</span>
        <button onClick={enterConstant} disabled={!isIframeReady || hasEntered} style={noDragStyle}>
          Enter
        </button>
        <button
          onClick={startPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "constant"}
          style={noDragStyle}
        >
          Start
        </button>
        <button
          onClick={pausePreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "constant"}
          style={noDragStyle}
        >
          Pause
        </button>
        <button
          onClick={stopPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "constant"}
          style={noDragStyle}
        >
          Stop
        </button>
        <button
          onClick={exitPreview}
          disabled={!isIframeReady || !hasEntered || activeMode !== "constant"}
          style={noDragStyle}
        >
          Exit
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: isConnected ? "green" : "red" }}>
          {isConnected ? "● Connected" : "○ Disconnected"}
        </span>
        <span style={{ fontSize: 12, color: isIframeReady ? "green" : "gray" }}>
          {isIframeReady ? "● iFrame Ready" : `○ iFrame: ${iframeStatus}`}
        </span>
        <span style={{ fontSize: 12 }}>
          Opacity: <b>{windowOpacity === null ? "--" : windowOpacity.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={Math.round((windowOpacity ?? 1) * 100)}
          onChange={(e) => patchWindowOpacity(Number(e.target.value) / 100)}
          style={{ width: 120, ...noDragStyle }}
        />
        <span style={{ fontSize: 12 }}>
          Theme Opacity: <b>{themeOpacity.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(themeOpacity * 100)}
          onChange={(e) => patchThemeOpacity(Number(e.target.value) / 100)}
          disabled={!isIframeReady}
          style={{ width: 120, ...noDragStyle }}
        />
        <span style={{ fontSize: 12 }}>
          Preview: <b>{playbackState}</b>
          {playbackState === "countdown" && typeof previewState?.countdownLeftSec === "number"
            ? ` (${previewState.countdownLeftSec}s)`
            : null}
        </span>

        {!isRecognizing ? (
          <button
            onClick={handleStart}
            style={{
              padding: "6px 15px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              ...noDragStyle,
            }}
          >
            开始跟读
          </button>
        ) : (
          <button
            onClick={handleStop}
            style={{
              padding: "6px 15px",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              ...noDragStyle,
            }}
          >
            停止
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", background: "transparent" }}>
        <iframe
          ref={iframeRef}
          src="http://localhost:5174/editor/1.1.0-dev.6/"
          style={{ width: "100%", height: "100%", border: "none" }}
          onLoad={() => {
            setHasEntered(false);
            setActiveMode(null);
          }}
        />
      </div>

      <div
        style={{
          padding: "5px 20px",
          backgroundColor: "rgba(238, 238, 238, 0.6)",
          borderTop: "1px solid #ddd",
          fontSize: 12,
          display: "flex",
          gap: 20,
        }}
      >
        <span>进度: {previewState ? Math.round(((previewState.progress as number | undefined) ?? 0) * 100) : 0}%</span>
        <span>偏移: {(previewState?.textOffset as number | undefined) ?? 0}</span>
        <span>片段: {(previewState?.segmentIndex as number | undefined) ?? 0}</span>
        <span style={{ flex: 1, textAlign: "right", color: "#666" }}>{asrEvent?.text || "等待输入..."}</span>
      </div>

      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 20,
            right: 20,
            padding: 10,
            backgroundColor: "rgba(220, 53, 69, 0.9)",
            color: "white",
            borderRadius: 4,
            zIndex: 1000,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
