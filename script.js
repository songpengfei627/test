/*******************************
 * 纯前端直连飞书 Webhook 版本
 * ⚠️ 风险：Webhook 暴露在前端，任何人可滥用
 *******************************/

// ========== 配置区 ==========
const USE_DIRECT_FEISHU = true; // true=前端直连飞书；false=走你后端（/api/feishu）
const FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/open-apis/bot/v2/hook/6435c441-cb0c-44e3-9d97-ea4a38fb82c5';

// 如果改为后端转发，只要把上面改成：const USE_DIRECT_FEISHU = false;
// 并确保你的后端已部署好，然后设置：
const BACKEND_ENDPOINT = '/api/feishu'; // 走同域 Vercel/后端时使用
// ===========================


// ---------- DOM 引用 ----------
const chatLog   = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendBtn   = document.getElementById('send-btn');

// ---------- 状态 ----------
let stage = 0;  // 0: 询问需求 -> 1: 推荐 -> 2: 结束并上报
const userMessages = [];
let submitted = false;
const convoId = Math.random().toString(36).slice(2, 10);

// ---------- UI：渲染气泡 ----------
function createMsg(text, sender) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrapper ' + sender;

  const avatar = document.createElement('div');
  avatar.className = 'avatar ' + sender;

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + sender;
  bubble.innerHTML = String(text).replace(/\n/g, '<br>');

  if (sender === 'bot') {
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
  } else {
    wrap.appendChild(bubble);
    wrap.appendChild(avatar);
  }
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---------- 初始化 ----------
window.addEventListener('load', () => {
  createMsg('我是您的智能客服，很高兴为您服务。这里有什么可以帮到您的？例如，您可以输入“推荐一款台灯”。', 'bot');
  userInput?.focus();
});

// ---------- 机器人回复 ----------
function botRespond() {
  if (stage === 0) {
    createMsg(
      '您好，可以了解一下您对台灯的需求吗？比如：<br>- 使用场景？<br>- 亮度要求？<br>- 是否偏好极简/可爱/复古等外观风格？<br>告诉我您的偏好，我来为您推荐合适的台灯哦！',
      'bot'
    );
  } else if (stage === 1) {
    createMsg(
      '亲，为您推荐以下产品：<br><b>「X-Lux 多功能智能台灯」</b><br>- 多段亮度与色温调节<br>- 无线充电 / 时间显示 / 蓝牙音箱<br>- 外观简洁百搭，适合卧室、书桌、化妆台等' +
      '<br><img src="./result2.jpg" alt="黑色百褶落地灯" class="product">',
      'bot'
    );

    setTimeout(() => {
      createMsg('🎉 感谢您的反馈，本轮对话已结束，您的服务代码是<b>TC100</b>，请返回问卷继续作答。', 'bot');
      // 结束时一次性上报
      submitAllMessagesOnce();
    }, 800);
  }
  stage++;
}

// ---------- 构建上报负载 ----------
function buildFeishuTextPayload() {
  const lines = userMessages.map((m, i) => `${i + 1}) ${m.text}`).join('\n');
  return {
    msg_type: 'text',
    content: { text: `会话ID：${convoId}\n条数：${userMessages.length}\n\n${lines}` }
  };
}

// （可选）卡片格式，如果以后需要更美观
function buildFeishuCardPayload() {
  const codeBlock = userMessages.map((m, i) => `${i + 1}) ${m.text}`).join('\n');
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: { template: 'turquoise', title: { tag: 'plain_text', content: '问卷对话记录' } },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: `**会话ID**：${convoId}\n**条数**：${userMessages.length}` } },
        { tag: 'hr' },
        { tag: 'div', text: { tag: 'lark_md', content: '```\\n' + codeBlock + '\\n```' } }
      ]
    }
  };
}

// ---------- 直连飞书：A. sendBeacon ----------
function trySendBeaconToFeishu(payloadObj) {
  try {
    const blob = new Blob([JSON.stringify(payloadObj)], { type: 'application/json' });
    // sendBeacon 不会预检，但拿不到结果（返回 boolean 表示“尝试发送”）
    return navigator.sendBeacon(FEISHU_WEBHOOK_URL, blob);
  } catch (e) {
    console.debug('sendBeacon error (ignored):', e);
    return false;
  }
}

// ---------- 直连飞书：B. no-cors fetch（兜底） ----------
async function tryNoCorsFetchToFeishu(payloadObj) {
  try {
    await fetch(FEISHU_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors', // 生成 opaque 请求，无法读取响应；避免预检
      headers: { 'Content-Type': 'text/plain' }, // 不用 application/json，避免预检
      body: JSON.stringify(payloadObj)
    });
    return true;
  } catch (e) {
    console.debug('no-cors fetch error (ignored):', e);
    return false;
  }
}

// ---------- 通过你自己的后端（更安全） ----------
async function submitViaBackend(payloadObj) {
  try {
    await fetch(BACKEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadObj)
    });
    return true;
  } catch (e) {
    console.debug('backend fetch error (ignored):', e);
    return false;
  }
}

// ---------- 一次性上报（静默，不在 UI 提示） ----------
async function submitAllMessagesOnce() {
  if (submitted) return;
  submitted = true;

  // 默认用文本消息；需要卡片就把 payload 换成 buildFeishuCardPayload()
  const feishuPayload = buildFeishuTextPayload();

  if (USE_DIRECT_FEISHU) {
    // A. 先用 sendBeacon（无需预检）
    const sent = trySendBeaconToFeishu(feishuPayload);
    if (sent) return;

    // B. 失败则 no-cors 兜底
    await tryNoCorsFetchToFeishu(feishuPayload);
    return;
  }

  // 方案二：走后端（推荐生产）
  await submitViaBackend({ msgType: 'text', text: feishuPayload.content.text });
}

// ---------- 发送消息 ----------
async function sendMessage() {
  const text = (userInput?.value || '').trim();
  if (!text) return;

  createMsg(text, 'user');
  userInput.value = '';
  sendBtn.disabled = true;

  // 只缓存，不立刻上报
  userMessages.push({ text, stage, ts: new Date().toISOString() });

  setTimeout(() => {
    sendBtn.disabled = false;
    botRespond();
  }, 600);
}

// ---------- 事件绑定 ----------
sendBtn?.addEventListener('click', sendMessage);
userInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) sendMessage();
});

