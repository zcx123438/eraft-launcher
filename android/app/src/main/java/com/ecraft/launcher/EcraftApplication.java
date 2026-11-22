package com.ecraft.launcher;

import androidx.multidex.MultiDex;
import android.content.Context;

/**
 * ecraft launcher 应用入口。
 * 继承 Pojav 引擎 Application（GPLv3），完成运行时组件解包、
 * 存储常量初始化与崩溃捕获等引擎级准备工作。
 * 引擎源码：https://github.com/PojavLauncherTeam/PojavLauncher
 */
public class EcraftApplication extends net.kdt.pojavlaunch.PojavApplication {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        MultiDex.install(this);
    }
}
