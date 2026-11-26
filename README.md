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
- 🧰 **工具箱（v2.0 新增）**：
  - 🔍 **错误分析**：粘贴崩溃日志，自动识别 12 类常见错误（内存不足、Java 版本、模组冲突、Mixin 失败、显卡问题等）并给出解决方案
  - 📦 **JAR 完整性检测**：ZIP 结构校验 + 逐条目 CRC32 校验 + 清单检查，自动识别 Fabric / Forge / Quilt 模组与客户端类型，定位损坏条目
  - 🎵 **音乐播放器**：播放本地音乐，支持播放列表、进度/音量控制

> 本项目托管于 GitHub：https://github.com/zcx123438/eraft-launcher

## 平台支持

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Windows | ✅ 完整可用 | NSIS 安装包 + 便携版，自动下载 + 启动 |
| macOS | ✅ 完整可用 | DMG，自动下载 + 启动（需系统已装 Java 或在设置中指定路径） |
| Android | ✅ 可游玩 | APK 可安装，**v2.1.0 起内置游戏引擎（PojavLauncher 内核）**：下载版本后可直接在手机上启动游玩 |
| iOS | ⚠️ 侧载可用 | v2.2.0 起提供 **未签名 IPA**（云端 macOS 自动构建），需 AltStore / Sideloadly / TrollStore 侧载；支持版本浏览、下载与文件管理，游戏文件位于「文件」App → ecraft launcher；**启动游戏**请配合 [PojavLauncher iOS](https://github.com/PojavLauncherTeam/PojavLauncher_iOS) |

## 下载安装

1. 进入本仓库的 **Actions** 页面，选择任意一次构建
2. 在 **Artifacts** 中下载对应平台的产物：
   - `ecraft-Windows`：`ecraft launcher Setup.exe`（安装版）/ 便携 exe
   - `ecraft-macOS`：`ecraft launcher.dmg`
   - `ecraft-android`：`app-debug.apk`
3. 打 tag（如 `v1.0.0`）推送后，会自动发布到 **Releases**

## iOS 安装说明（侧载）

1. 从 Releases 下载 `ecraft-launcher-x.x.x-ios-unsigned.ipa`
2. 任选一种侧载方式安装：
   - **AltStore / SideStore**：导入 IPA，用你的 Apple ID 签名安装（免费账号 7 天续签）
   - **Sideloadly**：Windows/Mac 均可，连数据线签名安装
   - **TrollStore**：仅限支持的系统版本，可直接安装未签名 IPA，永久有效
3. 首次打开若提示「未受信任的企业级开发者」，到「设置 → 通用 → VPN 与设备管理」中信任
4. 游戏文件目录：**「文件」App → 我的 iPhone → ecraft launcher → .minecraft**

> iOS 系统限制 JIT，Minecraft Java 版需借助 PojavLauncher iOS 运行；本启动器负责版本下载、文件管理与工具箱。

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

> v2.0 工具箱代码位于 `src/toolbox.js`（错误分析规则、ZIP/CRC32 校验器、播放器控制）。

## 路线图

- [x] Android 端集成 PojavLauncher 运行内核，实现手机直接启动游戏（v2.1.0 完成）
- [ ] 微软正版登录（MSA OAuth）
- [ ] Forge / Fabric / OptiFine 自动安装
- [ ] 模组与整合包管理

## 许可证

本项目整体以 **GPLv3** 发布（安卓端内置的游戏引擎基于 [PojavLauncher](https://github.com/PojavLauncherTeam/PojavLauncher)（GPLv3），依照许可证要求本项目同以 GPLv3 开源并向 PojavLauncher Team 致谢）。

MIT。Minecraft 为 Mojang / Microsoft 的商标，本项目仅为第三方启动器，请支持正版。
