; ------------------------------------------------------------------
; WorkBuddyForMe NSIS custom hooks (electron-builder assisted installer)
; ------------------------------------------------------------------
; 卸载数据策略（deleteAppDataOnUninstall 保持 false，默认保留数据）：
; - 交互式卸载：un.onInit 阶段询问是否同时删除用户数据
; - 静默卸载（electron-updater 跨版本升级时以 /S 运行旧卸载器）：永远保留数据
;
; 注意 1：electron-builder 分两次编译安装器与卸载器（BUILD_UNINSTALLER 开关），
; 本文件同时参与两次编译；变量与钩子只在卸载器目标声明，否则安装器目标
; 「Var 声明但未引用」触发 warning 6001，而 NSIS 构建 warningsAsErrors 会失败。
;
; 注意 2：数据路径有两个真实位置（v1.2 真机验收核实，勿用 productName 猜）：
;   %APPDATA%\@wbfm\desktop        Electron userData（appId=com.wbfm.desktop），
;                                  打包态数据根 userData/data、pet/updater/窗口状态均在此
;   %USERPROFILE%\.workbuddy-for-me  dev:3000 与显式 WBFM_DATA_ROOT 共用的数据根
; ------------------------------------------------------------------

!include "LogicLib.nsh"

!ifdef BUILD_UNINSTALLER
Var DeleteUserData

!macro customUnInit
  StrCpy $DeleteUserData "0"
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "卸载 WorkBuddyForMe 时，是否同时删除我的所有数据？$\r$\n$\r$\n包括本地模型、对话记录、知识库与全部配置（%APPDATA%\@wbfm 与 ~/.workbuddy-for-me），删除后不可恢复。$\r$\n$\r$\n选「是」删除数据；选「否」保留数据，下次安装仍可继续使用。" \
      IDNO +2
      StrCpy $DeleteUserData "1"
  ${EndIf}
!macroend

!macro customUnInstall
  ${If} $DeleteUserData == "1"
    ; Electron userData（appId 推导目录，含打包态数据根 data/）
    RMDir /r "$APPDATA\@wbfm"
    ; dev/打包共用数据根（本地模型与 v1.0-v1.1 真机抽测数据的实际位置）
    RMDir /r "$PROFILE\.workbuddy-for-me"
  ${EndIf}
  ; 兜底：electron-builder assisted 卸载器实测两次残留空 $INSTDIR 壳（自删除竞态）。
  ; 本宏执行时卸载器已复制到 %TEMP%\~nsu.tmp 运行，$INSTDIR 可安全删除。
  RMDir "$INSTDIR"
!macroend
!endif
