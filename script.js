// ------------------------ 配置区 ------------------------
const SUBMIT_ENDPOINT = '/api/feishu'; // Vercel 后端相对路径
const USE_CARD = false;                // true=发送飞书卡片消息；false=发送纯文本
const AUTO_SCROLL = true;              // 显示新消息时自动滚动
// ------------------------------------------------------

// DOM 引用
const chatLog   = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendBtn   = document.getElementById('send-btn');

// 对话状态
let stage = 0; // 0: 询问需求 -> 1: 推荐 -> 2: 结束上报
const userMessages = []; // 仅保存“用户”侧输入
let submitted = false;   // 防止重复上报
const convoId = Math.random().toString(36).slice(2, 10);

// 工具：渲染一条对话气泡
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

// 入口：页面载入后发首条欢迎消息
window.addEventListener('load', () => {
  createMsg('我是您的智能客服，很高兴为您服务。这里有什么可以帮到您的？例如，您可以输入“推荐一款台灯”。', 'bot');
  userInput?.focus();
});

// 机器人回复（按阶段）
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

// 汇总文本（纯文本消息用）
function makeAggregatedText() {
  const lines = userMessages.map((m, i) => `${i + 1}) ${m.text}`);
  return `会话ID：${convoId}\n条数：${userMessages.length}\n\n` + lines.join('\n');
}

// 生成飞书卡片（卡片消息用）
function makeCardPayload() {
  const codeBlock = userMessages.map((m, i) => `${i + 1}) ${m.text}`).join('\n');
  return {
    config: { wide_screen_mode: true },
    header: { template: 'turquoise', title: { tag: 'plain_text', content: '问卷对话记录' } },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**会话ID**：${convoId}\n**条数**：${userMessages.length}` } },
      { tag: 'hr' },
      { tag: 'div', text: { tag: 'lark_md', content: '```\\n' + codeBlock + '\\n```' } }
    ]
  };
}

// 一次性提交（静默）：先正常 fetch，失败仅写控制台，不打断 UI
async function submitAllMessagesOnce() {
  if (submitted) return;
  submitted = true;

  const payload = USE_CARD
    ? { msgType: 'interactive', card: makeCardPayload() }
    : { msgType: 'text', text: makeAggregatedText() };

  try {
    await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // 静默失败：不打扰用户，仅记录
    console.debug('提交到后端失败（静默）:', e);
  }
}

// 发送按钮 / 回车发送
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

// 事件绑定
sendBtn?.addEventListener('click', sendMessage);
userInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    // 避免在中文输入法合成阶段触发
    if (e.isComposing) return;
    sendMessage();
  }
});


