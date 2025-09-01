/********************************************
 * 方案 B：纯前端直连飞书 Webhook（尽力而为）
 * ⚠️ 风险：Webhook 暴露在前端；跨域不可读结果
 ********************************************/

// ====== 配置区 ======
const FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/open-apis/bot/v2/hook/6435c441-cb0c-44e3-9d97-ea4a38fb82c5'; // ← 必改
const USE_CARD = false;           // true：发送卡片；false：发送纯文本
const AUTO_SCROLL = true;         // 新消息自动滚动
// ====================

// DOM
const chatLog   = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendBtn   = document.getElementById('send-btn');

// 状态
let stage = 0; // 0: 询问需求 -> 1: 推荐 -> 2: 结束并上报
const userMessages = []; // 仅缓存用户输入
let submitted = false;   // 防重复提交
const convoId = Math.random().toString(36).slice(2, 10);

// 工具：渲染气泡
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
  if (AUTO_SCROLL) chatLog.scrollTop = chatLog.scrollHeight;
}

// 初始化
window.addEventListener('load', () => {
  createMsg('我是您的智能客服，很高兴为您服务。这里有什么可以帮到您的？例如，您可以输入“推荐一款台灯”。', 'bot');
  userInput?.focus();
});

// 机器人阶段回复
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
      // 对话结束：一次性上报
      submitAllMessagesOnce();
    }, 800);
  }
  stage++;
}

// ====== 飞书负载构建 ======
function makeTextPayload() {
  const lines = userMessages.map((m, i) => `${i + 1}) ${m.text}`).join('\n');
  return {
    msg_type: 'text',
    content: { text: `会话ID：${convoId}\n条数：${userMessages.length}\n\n${lines}` }
  };
}

function makeCardPayload() {
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
// ==========================

// A. 首选 sendBeacon（无预检、不可读结果）
function trySendBeacon(payloadObj) {
  try {
    const blob = new Blob([JSON.stringify(payloadObj)], { type: 'application/json' });
    // 返回 boolean：仅表示“尝试提交”，不代表服务端已接收
    return navigator.sendBeacon(FEISHU_WEBHOOK_URL, blob);
  } catch (e) {
    console.debug('sendBeacon error (ignored):', e);
    return false;
  }
}

// B. 兜底 no-cors fetch（必须避免预检；不可读结果）
async function tryNoCorsFetch(payloadObj) {
  try {
    await fetch(FEISHU_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',            // 生成 opaque 请求，浏览器不校验也不返回可读体
      credentials: 'omit',        // 关键：绝不能 'include'，否则预检更严格
      headers: { 'Content-Type': 'text/plain' }, // 不能用 application/json，否则触发预检
      body: JSON.stringify(payloadObj)
    });
    return true;
  } catch (e) {
    console.debug('no-cors fetch error (ignored):', e);
    return false;
  }
}

// 一次性上报（静默）
async function submitAllMessagesOnce() {
  if (submitted) return;
  submitted = true;

  const payload = USE_CARD ? makeCardPayload() : makeTextPayload();

  // 先用 sendBeacon
  const sent = trySendBeacon(payload);
  if (sent) return;

  // 失败则 no-cors 兜底
  await tryNoCorsFetch(payload);
}

// 发送消息
async function sendMessage() {
  const text = (userInput?.value || '').trim();
  if (!text) return;

  createMsg(text, 'user');
  userInput.value = '';
  sendBtn.disabled = true;

  // 只缓存，不立刻上传
  userMessages.push({ text, stage, ts: new Date().toISOString() });

  setTimeout(() => {
    sendBtn.disabled = false;
    botRespond();
  }, 600);
}

// 事件绑定
sendBtn?.addEventListener('click', sendMessage);
userInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) sendMessage();
});
