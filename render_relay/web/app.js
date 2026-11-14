'use strict';
let token = '';
let currentUsername = '';
let nativeDownloadPostAvailable = false;
let poll;
let downloading = false;
let archiveEnabled = false;
let dasiwaTurboLoraAvailable = false;
let dasiwaTurboLoraStrengthAvailable = false;
let yzFightLoraAvailable = false;
let mediaReferenceAvailable = false;
let aspectRatioAvailable = false;
const receipts = new Map();
const downloadLinks = new Map();
const $ = id => document.getElementById(id);
const uploadLimits = {images: 8 * 1024 * 1024, videos: 40 * 1024 * 1024, audios: 16 * 1024 * 1024};
let imagePreviewUrls = [];
let draggedImageIndex = null;
function swapImageSlots(from, to) {
  const files = Array.from($('images').files || []);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to ||
      from < 0 || to < 0 || from >= files.length || to >= files.length) return;
  [files[from], files[to]] = [files[to], files[from]];
  const reordered = new DataTransfer();
  for (const file of files) reordered.items.add(file);
  $('images').files = reordered.files;
  renderImageSlots();
  validateUploads();
  $('image-slot-hint').textContent = `已交换 Picture ${from + 1} 与 Picture ${to + 1}；实际提交顺序已更新，请同步检查提示词中的编号。可继续拖动，或按住 Alt 加左右方向键交换。`;
  $('image-slots').children[to]?.focus({preventScroll: true});
}
function renderImageSlots() {
  draggedImageIndex = null;
  $('image-slot-hint').textContent = '拖动缩略图到另一张图上可交换顺序，也可聚焦图片后按 Alt＋左右方向键。Picture 编号与提交顺序同步更新，请对应检查提示词。';
  for (const url of imagePreviewUrls) URL.revokeObjectURL(url);
  imagePreviewUrls = [];
  const container = $('image-slots');
  container.replaceChildren();
  const files = Array.from($('images').files || []);
  container.hidden = files.length === 0;
  for (const [index, file] of files.slice(0, 9).entries()) {
    const slot = document.createElement('li');
    slot.draggable = true;
    slot.tabIndex = 0;
    slot.title = '拖到另一张图上交换顺序；也可按 Alt + 左右方向键';
    slot.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
    slot.addEventListener('dragstart', event => {
      draggedImageIndex = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `Picture ${index + 1}`);
      slot.classList.add('dragging');
    });
    slot.addEventListener('dragover', event => {
      if (!Number.isInteger(draggedImageIndex) || draggedImageIndex === index) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      slot.classList.add('drop-target');
    });
    slot.addEventListener('dragleave', event => {
      if (!slot.contains(event.relatedTarget)) slot.classList.remove('drop-target');
    });
    slot.addEventListener('drop', event => {
      if (!Number.isInteger(draggedImageIndex)) return;
      event.preventDefault();
      const from = draggedImageIndex;
      draggedImageIndex = null;
      slot.classList.remove('drop-target');
      slot.classList.remove('dragging');
      swapImageSlots(from, index);
    });
    slot.addEventListener('dragend', () => {
      draggedImageIndex = null;
      for (const card of container.children) card.classList.remove('dragging', 'drop-target');
    });
    slot.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      swapImageSlots(index, index + (event.key === 'ArrowLeft' ? -1 : 1));
    });
    const picture = `Picture ${index + 1}`;
    const label = document.createElement('strong');
    label.textContent = picture;
    const preview = document.createElement('img');
    preview.draggable = false;
    preview.alt = `${picture}：${file.name}`;
    const url = URL.createObjectURL(file);
    imagePreviewUrls.push(url);
    preview.src = url;
    preview.addEventListener('error', () => {
      const fallback = document.createElement('p');
      fallback.className = 'image-preview-error';
      fallback.textContent = '无法预览，请检查图片格式';
      preview.replaceWith(fallback);
    }, {once: true});
    const name = document.createElement('span');
    name.className = 'image-slot-name';
    name.textContent = file.name;
    name.title = file.name;
    slot.append(label, preview, name);
    container.append(slot);
  }
}
function selectedFiles() {
  return Object.entries(uploadLimits).flatMap(([name, limit]) =>
    Array.from($(name).files || []).map(file => ({name, file, limit})));
}
function validateUploads() {
  const files = selectedFiles();
  const total = files.reduce((sum, item) => sum + item.file.size, 0);
  const oversized = files.find(item => item.file.size > item.limit);
  const summary = $('upload-size-summary');
  summary.textContent = `已选参考素材 ${ (total / 1048576).toFixed(1) } MB / 90 MB；图片单张≤8MB，视频≤40MB，音频≤16MB。`;
  if ($('images').files.length > 9) return '参考图片最多9张，请重新选择。';
  if (oversized) {
    const label = {images: '图片', videos: '视频', audios: '音频'}[oversized.name];
    return `${label}“${oversized.file.name}”为${(oversized.file.size / 1048576).toFixed(1)}MB，超过单文件限制${oversized.limit / 1048576}MB。`;
  }
  if (total > 90 * 1024 * 1024) return `参考素材合计 ${(total / 1048576).toFixed(1)}MB，超过90MB总限制，请减少或压缩素材。`;
  return '';
}
function updateResolution() {
  const fullHD = $('resolution').value === '1080p';
  const native = $('resolution').value === '768p';
  const limit = 30;
  for (const option of $('seconds').options) {
    option.disabled = Number(option.value) > limit;
    option.hidden = option.disabled;
  }
  if (Number($('seconds').value) > limit) $('seconds').value = String(limit);
  $('resolution-hint').textContent = fullHD ? '1080p 最长30秒，单段生成；高分辨率长视频会显著增加显存占用与生成时间。' : native ? '768p 最长30秒，单段生成；画质优先建议从此分辨率开始。' : '720p 最长30秒，单段生成。';
  updateAspectRatio();
}
function updateAspectRatio() {
  const sizes = { '720p': [1280, 1280 * 736], '768p': [1344, 1344 * 768], '1080p': [1920, 1920 * 1088] };
  const ratios = $('aspect-ratio');
  const [maxEdge, area] = sizes[$('resolution').value];
  for (const option of ratios.options) {
    const [rw, rh] = option.value.split(':').map(Number);
    const ratio = rw / rh;
    let width = Math.sqrt(area * ratio), height = Math.sqrt(area / ratio);
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    width = Math.max(32, Math.floor(width * scale / 32 + 0.5) * 32);
    height = Math.max(32, Math.floor(height * scale / 32 + 0.5) * 32);
    option.textContent = `${option.value} · ${width} × ${height}`;
  }
  $('orientation').value = Number(ratios.value.split(':')[0]) < Number(ratios.value.split(':')[1]) ? 'portrait' : 'landscape';
}
function updateInputCapabilities(data) {
  mediaReferenceAvailable = Boolean(data.media_reference_available);
  aspectRatioAvailable = Boolean(data.aspect_ratio_available);
  $('media-reference-options').hidden = !mediaReferenceAvailable;
  $('videos').disabled = !mediaReferenceAvailable;
  $('audios').disabled = !mediaReferenceAvailable;
  $('aspect-ratio-control').hidden = !aspectRatioAvailable;
  $('aspect-ratio').disabled = !aspectRatioAvailable;
  $('legacy-orientation-control').hidden = aspectRatioAvailable;
  $('orientation').disabled = aspectRatioAvailable;
}
function updateLoraOptions() {
  const isDasiwa = $('model').value === 'dasiwa-turbo-v3';
  const isYz = $('model').value === 'yz-goldfish';
  $('dasiwa-lora-option').hidden = !isDasiwa;
  $('yz-fight-lora-option').hidden = !isYz;
  $('yz-dasiwa-lora-option').hidden = !isYz;
  $('use-lora').disabled = !isDasiwa || !dasiwaTurboLoraAvailable;
  $('lora-strength').disabled = !isDasiwa || !dasiwaTurboLoraAvailable || !dasiwaTurboLoraStrengthAvailable || !$('use-lora').checked;
  $('use-yz-fight-lora').disabled = !isYz || !yzFightLoraAvailable;
  $('yz-fight-lora-strength').disabled = !isYz || !yzFightLoraAvailable || !$('use-yz-fight-lora').checked;
  $('use-yz-dasiwa-lora').disabled = !isYz || !dasiwaTurboLoraAvailable;
  $('yz-dasiwa-lora-strength').disabled = !isYz || !dasiwaTurboLoraAvailable || !dasiwaTurboLoraStrengthAvailable || !$('use-yz-dasiwa-lora').checked;
  if (!isDasiwa) $('use-lora').checked = false;
  if (!isYz) $('use-yz-fight-lora').checked = false;
  if (!isYz) $('use-yz-dasiwa-lora').checked = false;
  $('dasiwa-lora-hint').textContent = !dasiwaTurboLoraAvailable
    ? 'LoRA尚未安装完成，安装后此开关会自动启用。'
    : !dasiwaTurboLoraStrengthAvailable
      ? '工作站更新重启后可调节强度；当前默认强度为1.00。'
      : '仅对 DaSiWa Turbo V3 生效；关闭时工作流不加载此 LoRA。';
  $('yz-fight-lora-hint').textContent = yzFightLoraAvailable
    ? '仅对 YZ 金鱼生效；权重范围 0–1。默认关闭，开启后加载 Combat V2。'
    : '未找到 Combat V2 武打 LoRA，安装到 YZ 金鱼模型的 loras 文件夹后会启用。';
  $('yz-dasiwa-lora-hint').textContent = !dasiwaTurboLoraAvailable
    ? 'DaSiWa Turbo LoRA 尚未安装完成。'
    : '仅对 YZ 金鱼生效；与武打 LoRA 独立开关，可分别启用或同时叠加。权重范围 0–1。';
}
$('use-lora').addEventListener('change', updateLoraOptions);
$('use-yz-fight-lora').addEventListener('change', updateLoraOptions);
$('use-yz-dasiwa-lora').addEventListener('change', updateLoraOptions);
$('lora-strength').addEventListener('input', () => {
  $('lora-strength-value').value = Number($('lora-strength').value).toFixed(2);
});
$('yz-fight-lora-strength').addEventListener('input', () => {
  $('yz-fight-lora-strength-value').value = Number($('yz-fight-lora-strength').value).toFixed(2);
});
$('yz-dasiwa-lora-strength').addEventListener('input', () => {
  $('yz-dasiwa-lora-strength-value').value = Number($('yz-dasiwa-lora-strength').value).toFixed(2);
});
$('resolution').addEventListener('change', updateResolution);
$('aspect-ratio').addEventListener('change', updateAspectRatio);
$('model').addEventListener('change', () => {
  if ($('model').value === 'h3-quality') $('resolution').value = '768p';
  updateResolution();
  updateLoraOptions();
});
updateResolution();
for (const id of Object.keys(uploadLimits)) $(id).addEventListener('change', validateUploads);
$('images').addEventListener('change', renderImageSlots);
// PORTAL_API 只在「页面不是由门户自己托管」时才需要（GitHub Pages 那种）。
// 门户自己托管时（不管是 127.0.0.1、局域网 IP 还是公网隧道域名），一律用 location.origin，
// 这样请求是同源，既不会踩跨域，也不用把每个访问地址都加进来源白名单。
const base = (window.PORTAL_API || location.origin).replace(/\/$/, '');
async function api(path, options = {}) {
  if (!base) throw new Error('远程工作站尚未连接，请联系管理员。');
  let response;
  try {
    response = await fetch(base + path, {cache: 'no-store', credentials: 'include', ...options, headers: {...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...(token ? {'Authorization': 'Bearer ' + token} : {}), ...options.headers}});
  } catch (_) { throw new Error('无法连接工作站，请确认工作站已启动。'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
async function refresh() {
  const session = token;
  if (!session) return;
  try {
    const data = await api('/api/tasks');
    if (session !== token) return;
    if (data.username !== currentUsername) throw new Error('账号状态不一致，请退出后重新登录。');
    nativeDownloadPostAvailable = Boolean(data.native_download_post_available);
    $('service-message').textContent = data.message;
    updateInputCapabilities(data);
    archiveEnabled = Boolean(data.archive);
    dasiwaTurboLoraAvailable = Boolean(data.dasiwa_turbo_lora_available);
    dasiwaTurboLoraStrengthAvailable = Boolean(data.dasiwa_turbo_lora_strength_available);
    yzFightLoraAvailable = Boolean(data.yz_fight_lora_available);
    const selectedModel = $('model').value;
    $('model').replaceChildren(...(data.models || []).map(model => {
      const option = new Option(model.name + (model.available ? '' : ' · 未安装'), model.id);
      option.disabled = !model.available;
      return option;
    }));
    if (Array.from($('model').options).some(o => o.value === selectedModel && !o.disabled)) $('model').value = selectedModel;
    updateLoraOptions();
    $('submit-button').disabled = !data.accepting_tasks || data.tasks.some(t => ['uploading','queued','running','ready','downloading','archive_pending'].includes(t.state));
    if (!downloading) renderTasks(data.tasks.filter(task => task.state !== 'deleted'));
  }
  catch (error) { if (session === token) $('service-message').textContent = error.message; }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-message').textContent = '';
  try {
    const result = await api('/api/login', {method: 'POST', body: JSON.stringify({username: $('username-input').value.trim(), password: $('password-input').value})});
    clearInterval(poll); downloadLinks.clear(); receipts.clear(); renderTasks([]);
    token = result.token; currentUsername = result.username;
    $('task-message').textContent = ''; $('service-message').textContent = '';
    $('password-input').value = ''; $('username').textContent = result.username;
    $('login-panel').hidden = true; $('workspace').hidden = false; $('identity').hidden = false;
    await refresh(); poll = setInterval(refresh, 5000);
  } catch (error) { $('login-message').textContent = error.message; }
  finally { $('login-button').disabled = false; }
});
function renderTasks(tasks) {
  const container = $('tasks'); container.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const title = document.createElement('h2'); title.textContent = '暂无运行任务';
    const subtitle = document.createElement('p'); subtitle.textContent = '提交后在这里查看状态并下载结果。';
    empty.append(title, subtitle); container.append(empty); return;
  }
  for (const task of tasks) {
    const row = document.createElement('article'); row.className = 'task-row';
    const body = document.createElement('div'); const name = document.createElement('h2');
    name.textContent = '任务 ' + task.id.slice(0, 8);
    const status = document.createElement('p'); status.textContent = task.message;
    body.append(name, status); row.append(body);
    if (task.state === 'ready') {
      const ticket = downloadLinks.get(task.id);
      if (ticket && ticket.expires * 1000 > Date.now()) {
        const link = document.createElement('button'); link.className = 'download';
        link.textContent = '下载视频';
        link.onclick = () => startNativeDownload(task.id, ticket);
        row.append(link);
        const done = document.createElement('button'); done.className = 'quiet';
        done.textContent = '确认已保存，完成任务';
        done.onclick = () => {
          if (confirm('请确认视频已下载完整且能正常播放。确认后将关闭下载入口，并清理主账号的工作站副本。')) acknowledge(task.id, ticket.receipt);
        };
        row.append(done);
      } else {
        const button = document.createElement('button'); button.className = 'download';
        button.textContent = '获取下载链接';
        button.onclick = () => prepareDownload(task.id);
        row.append(button);
      }
    }
    if (['ready','queued','failed'].includes(task.state)) {
      const cancel = document.createElement('button'); cancel.className = 'quiet'; cancel.textContent = '放弃并清理';
      cancel.onclick = async () => {
        if (!confirm('放弃该任务并删除工作站上的临时文件？')) return;
        try { await api('/api/tasks/' + task.id, {method:'DELETE'}); await refresh(); }
        catch(error) { $('task-message').textContent=error.message; }
      }; row.append(cancel);
    }
    container.append(row);
  }
}
async function startNativeDownload(id, ticket) {
  if (!token || downloading) return;
  if (!nativeDownloadPostAvailable) return saveAuthenticatedVideo(id, ticket);
  const form = document.createElement('form');
  form.method = 'POST'; form.action = base + ticket.path; form.target = '_blank';
  form.hidden = true;
  const field = document.createElement('input');
  field.type = 'hidden'; field.name = 'session'; field.value = token;
  form.append(field); document.body.append(form);
  form.submit(); form.remove();
  $('task-message').textContent = '已请求浏览器下载MP4，请在下载列表（Ctrl+J）查看进度；确认保存前不会清理结果。';
}
async function saveAuthenticatedVideo(id, ticket) {
  const session = token;
  const filename = decodeURIComponent(new URL(base + ticket.path).pathname.split('/').pop());
  let writable;
  downloading = true;
  try {
    // Request the picker within the click gesture, before the network request.
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({suggestedName: filename,
        types: [{description: 'MP4视频', accept: {'video/mp4': ['.mp4']}}]});
      if (session !== token) return;
      writable = await handle.createWritable();
    }
    const response = await fetch(base + '/api/tasks/' + encodeURIComponent(id) + '/download',
      {cache:'no-store', headers:{Authorization:'Bearer ' + session}});
    if (!response.ok) throw new Error('下载验证失败，请重新登录并获取下载入口。');
    const type = response.headers.get('Content-Type') || '';
    if (!/^(application\/octet-stream|video\/mp4)/i.test(type)) throw new Error('服务器返回的不是视频，已停止保存。');
    const total = Number(response.headers.get('Content-Length'));
    const reader = response.body.getReader();
    const chunks = []; let saved = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      if (writable) await writable.write(value); else chunks.push(value);
      saved += value.byteLength;
      if (session === token) $('task-message').textContent = `正在保存视频：${(saved/1048576).toFixed(1)}MB${total ? ' / '+(total/1048576).toFixed(1)+'MB（'+Math.floor(saved/total*100)+'%）' : ''}`;
    }
    if (total && saved !== total) throw new Error('视频传输不完整，请重试；工作站结果仍保留。');
    if (!saved) throw new Error('视频内容为空，已停止保存。');
    if (writable) { await writable.close(); writable = null; }
    else {
      const url = URL.createObjectURL(new Blob(chunks,{type:'video/mp4'}));
      const link = document.createElement('a'); link.href=url; link.download=filename;
      document.body.append(link); link.click(); link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    if (session === token) $('task-message').textContent = '视频传输完成，请检查MP4可正常播放后，再点击“确认已保存”。';
  } catch (error) {
    if (writable) { try { await writable.abort(); } catch (_) {} }
    if (session === token) $('task-message').textContent = error.name === 'AbortError' ? '已取消下载，工作站结果仍保留。' : error.message;
  } finally { downloading = false; if (session === token) await refresh(); }
}
async function acknowledge(id, receipt) {
  try {
    await api('/api/tasks/' + id + '/downloaded', {method:'POST',body:JSON.stringify({receipt,confirmed_saved:true})});
    receipts.delete(id); downloadLinks.delete(id); $('task-message').textContent = archiveEnabled ? '下载完成，账号归档已保留。' : '下载完成，工作站上的输入和结果已删除。'; await refresh();
  } catch(error) { receipts.set(id,receipt); $('task-message').textContent = '文件已保存，但清理确认失败。请点击任务旁的清理按钮重试。'; }
}
async function prepareDownload(id) {
  const session = token;
  try {
    const ticket = await api('/api/tasks/' + id + '/download-link', {method:'POST'});
    if (session !== token) return;
    downloadLinks.set(id, ticket);
    $('task-message').textContent='下载已准备好（1小时内有效）。请点击“下载视频”，由浏览器验证账号并下载MP4；确认保存前不会自动清理。';
    await refresh();
  } catch(error) { if (session === token) $('task-message').textContent=error.message; }
}
$('task-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const uploadError = validateUploads();
  if (uploadError) { $('task-message').textContent = uploadError; return; }
  $('submit-button').disabled=true; $('clear-form-button').disabled=true; $('task-message').textContent='正在上传…';
  try {
    const data=new FormData($('task-form'));
    await api('/api/tasks',{method:'POST',body:data});
    $('task-message').textContent='任务已提交，表单内容已保留；需要时可手动清空。'; await refresh();
  } catch(error) { $('task-message').textContent=error.message; $('submit-button').disabled=false; }
  finally { $('clear-form-button').disabled=false; }
});
$('clear-form-button').addEventListener('click',()=>{
  $('task-form').reset();
  updateResolution();
  updateLoraOptions();
  $('lora-strength-value').value = Number($('lora-strength').value).toFixed(2);
  $('yz-fight-lora-strength-value').value = Number($('yz-fight-lora-strength').value).toFixed(2);
  $('yz-dasiwa-lora-strength-value').value = Number($('yz-dasiwa-lora-strength').value).toFixed(2);
  $('task-message').textContent='表单已清空。';
});
$('task-form').addEventListener('reset', () => queueMicrotask(() => {
  renderImageSlots();
  validateUploads();
}));
if (document.modelContext?.registerTool) {
  document.modelContext.registerTool({name:'get_my_task_status',description:'读取当前登录账号的任务状态，不返回素材、提示词或结果。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>{const data=await api('/api/tasks');await refresh();return {tasks:data.tasks};}});
}
$('logout').addEventListener('click', async () => {
  const previousToken = token;
  token = ''; currentUsername = ''; clearInterval(poll);
  $('images').value = '';
  renderImageSlots();
  downloadLinks.clear(); receipts.clear(); renderTasks([]);
  $('task-message').textContent = ''; $('service-message').textContent = '';
  $('workspace').hidden = true; $('identity').hidden = true; $('login-panel').hidden = false;
  try { await api('/api/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + previousToken}}); } catch (_) {}
});
