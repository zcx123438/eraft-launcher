# ecraft launcher

跨平台 Minecraft 启动器，PCL（Plain Craft Launcher）风格界面 + 自研跨平台内核。
支持 **Windows / macOS / Android** 三端，内置 BMCLAPI 国内镜像下载加速。

> 说明：PCL2 原版是闭源的 Windows 程序，无法直接作为安卓 / macOS 的内核，
> 因此本项目采用「PCL 风格 UI + 自研内核」的实现方式，交互与视觉向 PCL 看齐。

## 功能

- 📋 获取全部 Minecraft 官方版本（正式版 / 快照 / 历史版本）
- ⬇️ 一键自动下载：客户端 jar、依赖库（libraries）、资源文件（assets），支持 SHA1 校验目录结构
- 🪞 BMCLAPI 国内镜像加速，失败自动回退 Mojang 官方源
- 🎮 一键启动游戏（离线登录模式，离线 UUID 与官方算法一致）
- 🧩 自动处理版本继承（Forge/整合包式 `inheritsFrom`）、natives 提取、JVM 参数与内存配置
- 🖥 PCL 风格 UI：侧边栏导航、卡片式布局、自绘标题栏

> 本项目托管于 GitHub：https://github.com/zcx123438/eraft-launcher

## 平台支持

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Windows | ✅ 完整可用 | NSIS 安装包 + 便携版，自动下载 + 启动 |
| macOS | ✅ 完整可用 | DMG，自动下载 + 启动（需系统已装 Java 或在设置中指定路径） |
| Android | ⚠️ 部分可用 | APK 可安装，支持版本浏览与游戏文件下载管理；**直接在手机上运行游戏**需要内置 Java 运行环境（PojavLauncher 内核集成已列入路线图） |

## 下载安装

1. 进入本仓库的 **Actions** 页面，选择任意一次构建
2. 在 **Artifacts** 中下载对应平台的产物：
   - `ecraft-Windows`：`ecraft launcher Setup.exe`（安装版）/ 便携 exe
   - `ecraft-macOS`：`ecraft launcher.dmg`
   - `ecraft-android`：`app-debug.apk`
3. 打 tag（如 `v1.0.0`）推送后，会自动发布到 **Releases**

## 本地开发

```bash
npm install
npm start            # 桌面端运行
npm run dist:win     # 打包 Windows
npm run dist:mac     # 打包 macOS
npm install && npx cap add android && npx cap copy   # 生成安卓工程
cd android && ./gradlew assembleDebug                # 构建 APK
```

## 目录结构

```
ecraft-launcher/
├── main.js               # Electron 主进程（窗口、进程启动、文件对话框）
├── preload.js            # 预加载桥接
├── src/
│   ├── index.html        # 界面（桌面与安卓共用）
│   ├── style.css         # PCL 风格样式
│   ├── app.js            # 界面控制器
│   ├── core.js           # 启动器内核（版本清单 / 下载 / 启动命令构建）
│   ├── adapter.js        # 平台适配层（Electron ↔ Capacitor）
│   └── md5.js            # 纯 JS MD5（安卓端离线 UUID）
├── capacitor.config.json # 安卓端配置
└── .github/workflows/build.yml  # 三端自动打包 CI
```

## 路线图

- [ ] Android 端集成 PojavLauncher 运行内核，实现手机直接启动游戏
- [ ] 微软正版登录（MSA OAuth）
- [ ] Forge / Fabric / OptiFine 自动安装
- [ ] 模组与整合包管理

## 许可证

MIT。Minecraft 为 Mojang / Microsoft 的商标，本项目仅为第三方启动器，请支持正版。
