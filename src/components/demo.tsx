import React, {useEffect, useMemo, useRef, useState} from "react";
import {useOnnxServer} from "../hook/useOnnxServer";

type PacificPlaybackState = "idle" | "countdown" | "playing" | "paused";

type PacificPreviewState = {
  playbackState?: PacificPlaybackState;
  progress?: number;
  countdownLeftSec?: number;
  textOffset?: number;
  segmentIndex?: number;
  [k: string]: unknown;
};

type FollowMatchMode = "strict" | "normal" | "loose";

const FOLLOW_MATCH_MODE_OPTIONS: Array<{
  value: FollowMatchMode;
  label: string;
}> = [
  {value: "strict", label: "strict"},
  {value: "normal", label: "normal"},
  {value: "loose", label: "loose"},
];

type PacificPreviewInstance = {
  enter?: (config: unknown) => unknown;
  start?: () => unknown;
  pause?: () => unknown;
  stop?: () => unknown;
  exit?: () => unknown;
  patchConfig?: (patch: unknown) => unknown;
  setConfig?: (config: unknown) => boolean;
  setDebugMode?: (enabled: boolean) => unknown;
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
  const noDragStyle = {WebkitAppRegion: "no-drag" as const};
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
  const [followMatchMode, setFollowMatchMode] = useState<FollowMatchMode>("normal");
  const [trackingDebugEnabled, setTrackingDebugEnabled] = useState<boolean>(false);
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
                content: "{\"type\":\"doc\",\"content\":[{\"type\":\"heading\",\"attrs\":{\"level\":1},\"content\":[{\"type\":\"text\",\"text\":\"快速上手\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"芦笋提词器\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(126, 211, 33)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"}],\"text\":\"芦笋提词器\"},{\"type\":\"text\",\"text\":\"是一款功能强大的智能提词工具，适用于多种场景，如直播带货、录课、在线会议、视频拍摄、演讲发言等，能够帮助用户告别忘词，提升表达的流畅度和专业性，提高工作效率。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(74, 144, 226)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"underline\"}],\"text\":\"智能跟读\"},{\"type\":\"text\",\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"芦笋提词器使用语音识别功能，在开启智能跟读后，提词进度会随着用户读稿速度动态变化，\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(248, 231, 28)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"}],\"text\":\"自动匹配语速\"},{\"type\":\"text\",\"text\":\"，演讲者读到哪里，提词内容就滚到哪里。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(189, 16, 224)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"underline\"}],\"text\":\"隐形提词\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"在\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"录制视频\"},{\"type\":\"text\",\"text\":\"、\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"直播\"},{\"type\":\"text\",\"text\":\"、\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"录屏\"},{\"type\":\"text\",\"text\":\"或\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"会议投屏\"},{\"type\":\"text\",\"text\":\"时，提词器内容\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(126, 211, 33)\",\"backgroundColor\":\"\",\"remark\":\"\"}}],\"text\":\"仅演讲者自己可见\"},{\"type\":\"text\",\"text\":\"，其他人无法看到，录制好的视频或会议内容中不会出现提词的文字，既保护了隐私，又保证了画面的专业性。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(241, 229, 4)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"underline\"}],\"text\":\"目录提词\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"支持手动设置提词\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"文稿目录\"},{\"type\":\"text\",\"text\":\"，在提词过程中，可以点击目录快速跳转至对应位置，让提词文稿结构更加清晰，提词器使用更加灵活。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(245, 166, 35)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"},{\"type\":\"underline\"}],\"text\":\"悬浮提词\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"支持将提词内容\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(248, 231, 28)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"}],\"text\":\"悬浮\"},{\"type\":\"text\",\"text\":\"在其他应用界面上，完美解决直播、口播场景下的提词需求，并且提词窗口可设置为透明，不遮挡画面、相机内容。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(208, 2, 27)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"},{\"type\":\"underline\"}],\"text\":\"个性化设置\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"可以方便地设置提词的\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"文字大小\"},{\"type\":\"text\",\"text\":\"、\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(65, 117, 5)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"}],\"text\":\"颜色\"},{\"type\":\"text\",\"text\":\"、\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"透明度\"},{\"type\":\"text\",\"text\":\"和\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"背景颜色\"},{\"type\":\"text\",\"text\":\"等，还能调整提词区域的大小和位置，以获得最佳的可视效果，满足用户的个性化需求。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(126, 211, 33)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"},{\"type\":\"underline\"}],\"text\":\"多端同步\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"支持手机、电脑等\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(208, 2, 27)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"bold\"}],\"text\":\"多端词条同步\"},{\"type\":\"text\",\"text\":\"，只需登录账号，历史记录就会自动同步，无论在哪个设备上都可以方便地使用之前的提词文稿，避免了重复操作的烦恼，保证了使用的连贯性和流畅性。\"}]},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"【\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"rgb(139, 87, 42)\",\"backgroundColor\":\"\",\"remark\":\"\"}},{\"type\":\"underline\"}],\"text\":\"蓝牙遥控器\"},{\"type\":\"text\",\"text\":\"】\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"芦笋提词器蓝牙遥控器是芦笋自研开发的辅助硬件，是一款支持「\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"提词器遥控\"},{\"type\":\"text\",\"text\":\"」「\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"PPT 翻页\"},{\"type\":\"text\",\"text\":\"」「\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"直录播遥控\"},{\"type\":\"text\",\"text\":\"」的三合一蓝牙遥控器\"}]},{\"type\":\"paragraph\"},{\"type\":\"heading\",\"attrs\":{\"level\":2},\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"下载方式\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"「\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"电脑端\"},{\"type\":\"text\",\"text\":\"」访问官网\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"tcq.lusun.com\"},{\"type\":\"text\",\"text\":\"或百度搜索“\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"#7ed321\",\"backgroundColor\":null,\"remark\":null}},{\"type\":\"bold\"}],\"text\":\"芦笋提词器\"},{\"type\":\"text\",\"text\":\"”\"}]},{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"「\"},{\"type\":\"text\",\"marks\":[{\"type\":\"bold\"}],\"text\":\"手机端\"},{\"type\":\"text\",\"text\":\"」到应用商店搜索“\"},{\"type\":\"text\",\"marks\":[{\"type\":\"textStyle\",\"attrs\":{\"color\":\"#7ed321\",\"backgroundColor\":null,\"remark\":null}},{\"type\":\"bold\"}],\"text\":\"芦笋提词器\"},{\"type\":\"text\",\"text\":\"”\"}]}]}",
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
                  referenceLine: {
                    enabled: false,
                  }
                },
              },
              debug: true,
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

  useEffect(() => {
    if (!isIframeReady) return;
    const preview = getPreviewInstance();
    if (!preview?.setDebugMode) return;
    safeCall("preview.setDebugMode", preview.setDebugMode, trackingDebugEnabled);
  }, [getPreviewInstance, isIframeReady, trackingDebugEnabled]);

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
    referenceLine: {
      enabled: true,
    },
  });

  const buildFollowConfig = (): unknown => ({
    playback: {
      mode: "follow",
      speed,
      countdownSec,
      loop: false,
      smartPause: false,
      phoneticFuzzyMode: followMatchMode,
    },
    theme: {
      opacity: themeOpacity,
    },
    referenceLine: {
      enabled: true
    }
  });

  const patchFollowMatchMode = (next: FollowMatchMode) => {
    setFollowMatchMode(next);
    if (!hasEntered || activeMode !== "follow") return;
    const preview = getPreviewInstance();
    if (!preview?.patchConfig) return;
    safeCall("preview.patchConfig", preview.patchConfig, {
      playback: {
        phoneticFuzzyMode: next,
      },
    });
  };

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

  const switchMode = (targetMode: "follow" | "constant") => {
    if (activeMode === targetMode) return;
    const preview = getPreviewInstance();
    if (!preview?.setConfig) return;
    const config = targetMode === "follow" ? buildFollowConfig() : buildConstantConfig();
    const ok = safeCall("preview.setConfig", preview.setConfig, config);
    if (ok !== false) {
      setActiveMode(targetMode);
    }
  };

  const toggleTrackingDebug = () => {
    setTrackingDebugEnabled((prev) => !prev);
  };

  const patchSpeed = (next: number) => {
    setSpeed(next);
    const preview = getPreviewInstance();
    if (!preview?.patchConfig) return;
    safeCall("preview.patchConfig", preview.patchConfig, {playback: {speed: next}});
  };

  const patchThemeOpacity = (next: number) => {
    setThemeOpacity(next);
    if (!hasEntered) return;
    const preview = getPreviewInstance();
    if (!preview?.patchConfig) return;
    safeCall("preview.patchConfig", preview.patchConfig, {theme: {opacity: next}});
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
    <div style={{display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden"}}>
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
          style={{padding: 4, fontSize: 12, ...noDragStyle}}
        >
          {microphones.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
            </option>
          ))}
        </select>
        <button onClick={() => refreshDevices()} style={{padding: "4px 8px", ...noDragStyle}}>
          🔄
        </button>

        <span style={{fontSize: 12}}>Speed</span>
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
        <span style={{fontSize: 12, width: 60}}>{speed}px/s</span>

        <span style={{fontSize: 12}}>Countdown</span>
        <input
          type="number"
          min={0}
          max={10}
          value={countdownSec}
          onChange={(e) => setCountdownSec(Number(e.target.value))}
          style={{width: 56, padding: 4, fontSize: 12, ...noDragStyle}}
          disabled={!isIframeReady || hasEntered}
        />

        <span style={{fontSize: 12}}>匹配严格度</span>
        <select
          value={followMatchMode}
          onChange={(e) => patchFollowMatchMode(e.target.value as FollowMatchMode)}
          style={{padding: 4, fontSize: 12, ...noDragStyle}}
          disabled={!isIframeReady}
        >
          {FOLLOW_MATCH_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <span style={{fontSize: 12, fontWeight: 600}}>跟读</span>
        <button
          onClick={toggleTrackingDebug}
          disabled={!isIframeReady}
          style={{
            padding: "4px 10px",
            backgroundColor: trackingDebugEnabled ? "#d97706" : "#4b5563",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            ...noDragStyle,
          }}
        >
          Tracking Debug: {trackingDebugEnabled ? "ON" : "OFF"}
        </button>
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

        <span style={{fontSize: 12, fontWeight: 600}}>匀速</span>
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

        <div style={{flex: 1}}/>

        <span style={{fontSize: 12, color: isConnected ? "green" : "red"}}>
          {isConnected ? "● Connected" : "○ Disconnected"}
        </span>
        <span style={{fontSize: 12, color: isIframeReady ? "green" : "gray"}}>
          {isIframeReady ? "● iFrame Ready" : `○ iFrame: ${iframeStatus}`}
        </span>
        <span style={{fontSize: 12}}>
          Opacity: <b>{windowOpacity === null ? "--" : windowOpacity.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={Math.round((windowOpacity ?? 1) * 100)}
          onChange={(e) => patchWindowOpacity(Number(e.target.value) / 100)}
          style={{width: 120, ...noDragStyle}}
        />
        <span style={{fontSize: 12}}>
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
          style={{width: 120, ...noDragStyle}}
        />
        <span style={{fontSize: 12}}>
          Preview: <b>{playbackState}</b>
          {playbackState === "countdown" && typeof previewState?.countdownLeftSec === "number"
            ? ` (${previewState.countdownLeftSec}s)`
            : null}
        </span>

        {hasEntered && (
          <button
            onClick={() => switchMode(activeMode === "follow" ? "constant" : "follow")}
            disabled={!isIframeReady}
            style={{
              padding: "6px 12px",
              backgroundColor: activeMode === "follow" ? "#007bff" : "#6c757d",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              ...noDragStyle,
            }}
          >
            {activeMode === "follow" ? "跟读模式" : "匀速模式"} (点击切换)
          </button>
        )}

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

      <div style={{flex: 1, overflow: "hidden", background: "transparent"}}>
        <iframe
          ref={iframeRef}
          src="http://localhost:6111/editor/1.1.0-dev.12"
          style={{width: "100%", height: "100%", border: "none"}}
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
        <span style={{flex: 1, textAlign: "right", color: "#666"}}>{asrEvent?.text || "等待输入..."}</span>
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
