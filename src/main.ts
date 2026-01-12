import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { sherpaServer } from "./services/sherpaServer";
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    transparent: true,
    backgroundColor: "#00000000",
    opacity: 0.9,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // 开发环境禁用安全策略以支持跨域iframe
      webSecurity: process.env.NODE_ENV !== "development",
      allowRunningInsecureContent: process.env.NODE_ENV === "development",
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  createWindow();

  // 自动启动 Sherpa 服务器
  if (sherpaServer) {
    console.log("Starting Sherpa ONNX server...");
    const started = await sherpaServer.start(6006);

    if (started) {
      console.log("Sherpa ONNX server started successfully");
    } else {
      console.error("Failed to start Sherpa ONNX server");
    }
  }

  app.on("window-all-closed", () => {
    // 停止服务器
    if (sherpaServer) {
      sherpaServer.stop();
    }

    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    // 确保在退出前停止服务器
    if (sherpaServer) {
      sherpaServer.stop();
    }
  });

  app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC 处理程序
ipcMain.handle("get-server-status", () => {
  return sherpaServer ? sherpaServer.getStatus() : { isRunning: false };
});

ipcMain.handle("restart-server", async () => {
  if (!sherpaServer) return false;

  sherpaServer.stop();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return await sherpaServer.start(6006);
});

ipcMain.handle("get-window-opacity", () => {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
  return win?.getOpacity() ?? 1;
});

ipcMain.handle("set-window-opacity", (_event, value: number) => {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!win || typeof value !== "number" || Number.isNaN(value)) {
    return win?.getOpacity() ?? 1;
  }
  const clamped = Math.min(1, Math.max(0, value));
  win.setOpacity(clamped);
  return clamped;
});
