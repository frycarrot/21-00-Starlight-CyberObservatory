@echo off
chcp 65001 >nul
rem 双击启动局域网预览。cmd 不能直接在网络路径下运行，pushd 会临时映射一个盘符。
pushd "%~dp0"
node tools\serve.mjs
popd
pause
