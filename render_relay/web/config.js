// 门户自己托管的前端一律走同源，这里必须留空。
//
// 踩过的坑（2026-10-22）：tunnel.py 以前会把公网 Funnel 地址写进这个文件，
// 结果从局域网 http://192.168.188.15:8290/ 打开页面时，API 请求全被指到
// https://xxx.ts.net，跨域直接被服务端的来源校验挡成 403，页面上就显示
// 「无法连接工作站，请确认工作站已启动」。
//
// 公网地址只写进 private/settings.json 的 public_api；GitHub Pages 那份前端
// 由 build_release.py 生成 private/release/config.js。
window.PORTAL_API = '';
