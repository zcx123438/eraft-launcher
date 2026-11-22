package com.ecraft.launcher;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.Map;
import java.util.UUID;
import net.kdt.pojavlaunch.MainActivity;
import net.kdt.pojavlaunch.PojavProfile;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.value.MinecraftAccount;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

/**
 * ecraft launcher 游戏启动桥：把 WebView 前端配置好的
 * 版本 / 玩家信息接到 Pojav 引擎的启动链路上。
 */
@CapacitorPlugin(name = "EcraftGame")
public class EcraftGamePlugin extends Plugin {

    @PluginMethod
    public void launch(PluginCall call) {
        String versionId = call.getString("versionId");
        String username = call.getString("username");
        if (versionId == null || versionId.isEmpty()) {
            call.reject("缺少 versionId");
            return;
        }
        if (username == null || username.isEmpty()) username = "Steve";
        try {
            Context ctx = getContext();
            if (!Tools.checkStorageRoot(ctx)) {
                call.reject("游戏存储不可用（外部存储未挂载）");
                return;
            }
            Tools.initStorageConstants(ctx);
            new File(Tools.DIR_GAME_NEW).mkdirs();
            new File(Tools.DIR_ACCOUNT_NEW).mkdirs();

            // 1. 写入离线账号（UUID 与官方离线算法一致）
            MinecraftAccount acc = new MinecraftAccount();
            acc.username = username;
            acc.isMicrosoft = false;
            acc.accessToken = "0";
            acc.clientToken = "0";
            acc.profileId = UUID.nameUUIDFromBytes(
                    ("OfflinePlayer:" + username).getBytes("UTF-8")).toString();
            acc.save();
            PojavProfile.setCurrentProfile(ctx, username);

            // 2. 建立 / 复用指向该版本的 profile
            LauncherProfiles.load();
            String key = null;
            for (Map.Entry<String, MinecraftProfile> e :
                    LauncherProfiles.mainProfileJson.profiles.entrySet()) {
                if (versionId.equals(e.getValue().lastVersionId)) { key = e.getKey(); break; }
            }
            if (key == null) {
                MinecraftProfile p = new MinecraftProfile();
                p.name = versionId;
                p.type = "ecraft";
                p.lastVersionId = versionId;
                key = LauncherProfiles.getFreeProfileKey();
                LauncherProfiles.mainProfileJson.profiles.put(key, p);
                LauncherProfiles.write();
            }
            LauncherPreferences.DEFAULT_PREF.edit()
                    .putString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, key).apply();

            // 3. 进入引擎渲染页（引擎自行完成 JVM 创建与游戏启动）
            Intent intent = new Intent(ctx, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("gameDir", Tools.DIR_GAME_NEW);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("启动失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void gameDir(PluginCall call) {
        try {
            Context ctx = getContext();
            if (Tools.checkStorageRoot(ctx)) Tools.initStorageConstants(ctx);
            JSObject ret = new JSObject();
            ret.put("path", Tools.DIR_GAME_NEW);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
