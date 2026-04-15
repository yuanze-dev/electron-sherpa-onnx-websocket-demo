import { useState, useCallback, useRef, useEffect } from "react";
// eslint-disable-next-line import/no-unresolved -- Vite "?url" import for worklet module path
import audioProcessor from "../processor/audio-processor?url";

interface UseOnnxServerProps {
  serverAddr?: string;
  serverPort?: number;
}

interface OnnxServerState {
  isConnected: boolean;
  isRecognizing: boolean;
  lastResult: string;
  asrEvent: {
    text: string;
    tokens: string[];
    timestamps: number[];
    type: "partial" | "final";
  } | null;
  error: string | null;
  microphones: Array<{ deviceId: string; label: string }>;
  selectedDeviceId: string | null;
}

export const useOnnxServer = ({
  serverAddr = "localhost",
  serverPort = 6006,
}: UseOnnxServerProps = {}) => {
  const [state, setState] = useState<OnnxServerState>({
    isConnected: false,
    isRecognizing: false,
    lastResult: "",
    asrEvent: null,
    error: null,
    microphones: [],
    selectedDeviceId: null,
  });

  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Enumerate available microphones. If labels are empty, request a quick permission to reveal labels.
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      let devices = await navigator.mediaDevices.enumerateDevices();
      let mics = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${idx + 1}`,
        }));

      // If labels are empty (no permission), grab a temporary stream to prompt and re-enumerate
      const allLabelsEmpty =
        mics.length > 0 &&
        mics.every((m) => !m.label || /^Microphone\s\d+/.test(m.label));
      if (allLabelsEmpty) {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          tmp.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          mics = devices
            .filter((d) => d.kind === "audioinput")
            .map((d, idx) => ({
              deviceId: d.deviceId,
              label: d.label || `Microphone ${idx + 1}`,
            }));
        } catch {
          // ignore; keep placeholder labels
        }
      }

      setState((prev) => {
        const currentSelection = prev.selectedDeviceId;
        const stillExists =
          currentSelection && mics.some((m) => m.deviceId === currentSelection);
        return {
          ...prev,
          microphones: mics,
          selectedDeviceId: stillExists
            ? currentSelection
            : (mics[0]?.deviceId ?? null),
        };
      });
    } catch (e) {
      // silently ignore enumeration errors
      // optionally surface to state if desired
    }
  }, []);

  // Auto-refresh on mount and when devices change
  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    try {
      navigator.mediaDevices?.addEventListener("devicechange", handler);
    } catch {
      // older Electron/Chromium may not support addEventListener on mediaDevices
      // noop
    }
    return () => {
      try {
        navigator.mediaDevices?.removeEventListener("devicechange", handler);
      } catch {
        // noop
      }
    };
  }, [refreshDevices]);

  const connect = useCallback(async () => {
    try {
      const websocket = new WebSocket(`ws://${serverAddr}:${serverPort}`);

      websocket.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
        }));
        console.log("Connected to ONNX server");
      };

      websocket.onmessage = (event) => {
        const message = event.data;

        if (message !== "Done!") {
          try {
            const data = JSON.parse(message);
            // 假设服务器返回格式包含 text, tokens, timestamps
            // 如果格式不符，这里需要映射
            const asrEvent = {
              text: data.text || "",
              tokens: data.tokens || (data.text ? Array.from(data.text) : []),
              timestamps:
                data.timestamps ||
                (data.text ? Array.from(data.text).map((_, i) => i * 0.1) : []),
              type: data.type || "partial",
            };

            setState((prev) => ({
              ...prev,
              lastResult: data.text || message,
              asrEvent: asrEvent,
            }));

            if (asrEvent.text !== "") {
              console.debug("[ONNX] Recognition Result ->", {
                text: asrEvent.text,
                tokens: asrEvent.tokens,
                timestamps: asrEvent.timestamps,
                type: asrEvent.type,
              });
            }
          } catch (e) {
            // If not JSON, treat as plain text
            const asrEvent = {
              text: message,
              tokens: Array.from(message),
              timestamps: Array.from(message).map((_, i) => i * 0.1),
              type: "partial",
            };

            setState((prev) => ({
              ...prev,
              lastResult: message,
              asrEvent: asrEvent,
            }));

            console.debug("[ONNX] Recognition Result (plain text) ->", {
              text: message,
              type: "partial",
            });
          }
        } else {
          console.debug("[ONNX] ✅ Recognition complete");
        }
      };

      websocket.onclose = () => {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isRecognizing: false,
        }));
        console.log("Disconnected from ONNX server");
      };

      websocket.onerror = (error) => {
        setState((prev) => ({
          ...prev,
          error: "WebSocket connection error",
          isConnected: false,
        }));
        console.error("WebSocket error:", error);
      };

      websocketRef.current = websocket;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to connect to server",
      }));
    }
  }, [serverAddr, serverPort]);

  const disconnect = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(
    async (deviceIdOverride?: string) => {
      if (
        !websocketRef.current ||
        websocketRef.current.readyState !== WebSocket.OPEN
      ) {
        setState((prev) => ({ ...prev, error: "WebSocket not connected" }));
        return;
      }

      try {
        const deviceIdToUse =
          deviceIdOverride ?? state.selectedDeviceId ?? undefined;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // Prefer the explicitly selected device if provided
            deviceId: deviceIdToUse ? { exact: deviceIdToUse } : undefined,
            sampleRate: 16000,
            channelCount: 1,
          },
        });

        console.log(
          "sampleRate",
          stream.getAudioTracks()[0].getSettings().sampleRate,
        );

        const audioContext = new AudioContext({ sampleRate: 16000 });

        await audioContext.audioWorklet.addModule(audioProcessor);

        const source = audioContext.createMediaStreamSource(stream);

        const workletNode = new AudioWorkletNode(
          audioContext,
          "audio-processor",
        );

        // Listen for audio data from the worklet
        workletNode.port.onmessage = (event) => {
          if (
            event.data.type === "audioData" &&
            websocketRef.current?.readyState === WebSocket.OPEN
          ) {
            const audioData = event.data.data;
            websocketRef.current.send(audioData.buffer);
          }
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        audioWorkletNodeRef.current = workletNode;
        streamRef.current = stream;

        setState((prev) => ({
          ...prev,
          isRecognizing: true,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: "Failed to access microphone",
        }));
        console.error("Microphone access error:", error);
      }
    },
    [state.selectedDeviceId],
  );

  const stopRecognition = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isRecognizing: false,
    }));
  }, []);

  // Change/select microphone; if currently recognizing, seamlessly restart capture with the new device
  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      setState((prev) => ({ ...prev, selectedDeviceId: deviceId }));

      const isActive = !!audioContextRef.current;
      if (isActive) {
        // Stop previous audio pipeline but keep websocket
        if (audioWorkletNodeRef.current) {
          try {
            audioWorkletNodeRef.current.disconnect();
          } catch {
            /* noop */
          }
          audioWorkletNodeRef.current = null;
        }
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach((t) => t.stop());
          } catch {
            /* noop */
          }
          streamRef.current = null;
        }
        if (audioContextRef.current) {
          try {
            await audioContextRef.current.close();
          } catch {
            /* noop */
          }
          audioContextRef.current = null;
        }
        // Restart with new device
        await startRecognition(deviceId);
      }
    },
    [startRecognition],
  );

  const clearResults = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastResult: "",
      error: null,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startRecognition,
    stopRecognition,
    clearResults,
    refreshDevices,
    selectMicrophone,
  };
};
