; ------------------------------------------------------------------
; WorkBuddyForMe NSIS custom hooks (electron-builder assisted installer)
; ------------------------------------------------------------------
; 卸载数据策略（deleteAppDataOnUninstall 保持 false，默认保留数据）：
; - 交互式卸载：un.onInit 阶段询问是否同时删除用户数据
; - 静默卸载（electron-updater 跨版本升级时以 /S 运行旧卸载器）：永远保留数据
;
; 注意：electron-builder 分两次编译安装器与卸载器（BUILD_UNINSTALLER 开关），
; 本文件同时参与两次编译；变量与钩子只在卸载器目标声明，否则安装器目标
; 「Var 声明但未引用」触发 warning 6001，而 NSIS 构建 warningsAsErrors 会失败。
; ------------------------------------------------------------------

!include "LogicLib.nsh"

!ifdef BUILD_UNINSTALLER
Var DeleteUserData

!macro customUnInit
  StrCpy $DeleteUserData "0"
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "卸载 WorkBuddyForMe 时，是否同时删除我的所有数据？$\r$\n$\r$\n包括本地模型、对话记录、知识库与全部配置，删除后不可恢复。$\r$\n$\r$\n选「是」删除数据；选「否」保留数据，下次安装仍可继续使用。" \
      IDNO +2
      StrCpy $DeleteUserData "1"
  ${EndIf}
!macroend

!macro customUnInstall
  ${If} $DeleteUserData == "1"
    ; 默认打包数据根（%APPDATA%\<productName>，含 userData/data）
    RMDir /r "$APPDATA\WorkBuddyForMe"
    ; 用户经数据根环境变量显式指定的默认目录（dev/打包共用时的真实数据位置）
    RMDir /r "$PROFILE\.workbuddy-for-me"
  ${EndIf}
!macroend
!endif
