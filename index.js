const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;
const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN;

if (!DEEPSEEK_API_KEY) {
    console.error('❌ 请设置环境变量 DEEPSEEK_API_KEY');
    process.exit(1);
}

const getBJTime = () => new Date(new Date().getTime() + (8 * 60 * 60 * 1000));

async function pushToFeishu(title, content) {
    if (!FEISHU_WEBHOOK) return;
    const chunkSize = 3000;
    const chunks = [];
    for (let i = 0; i < content.length; i += chunkSize) chunks.push(content.substring(i, i + chunkSize));
    for (let i = 0; i < chunks.length; i++) {
        const ct = chunks.length > 1 ? `${title} (${i+1}/${chunks.length})` : title;
        try {
            console.log(`[飞书] 发送 ${i+1}/${chunks.length} ...`);
            await axios.post(FEISHU_WEBHOOK, { msg_type: "text", content: { text: `【${ct}】\n\n${chunks[i]}` } }, { timeout: 30000 });
            console.log(`✅ [飞书] [${ct}] 成功`);
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(`❌ [飞书] [${ct}] 失败: ${e.message}`);
        }
    }
}

async function pushToWechat(title, content) {
    if (!PUSHPLUS_TOKEN) return;
    try {
        console.log(`[PushPlus] 推送: ${title}`);
        await axios.post('http://www.pushplus.plus/send', { token: PUSHPLUS_TOKEN, title, content, template: 'txt' }, { timeout: 30000 });
        console.log(`✅ [PushPlus] [${title}] 成功`);
    } catch (e) {
        console.error(`❌ [PushPlus] [${title}] 失败: ${e.message}`);
    }
}

async function pushMessage(title, content) {
    console.log(`[推送] ${title}，长度: ${content.length}`);
    await pushToFeishu(title, content);
    await pushToWechat(title, content);
}

const API_ENDPOINTS = [
    'https://api.deepseek.com/chat/completions',
    'https://api.siliconflow.cn/v1/chat/completions'
];

async function callAI(prompt) {
    for (let endpointIdx = 0; endpointIdx < API_ENDPOINTS.length; endpointIdx++) {
        const endpoint = API_ENDPOINTS[endpointIdx];
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                console.log(`[AI] 尝试: ${endpoint} (第${attempt+1}次)`);
                const model = endpoint.includes('siliconflow') ? 'deepseek-ai/DeepSeek-V3' : 'deepseek-chat';
                const res = await axios.post(endpoint, {
                    model,
                    messages: [
                        { role: "system", content: "你是一个专业的内容创作助手。" },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.8
                }, {
                    headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
                    timeout: 300000
                });
                const content = res.data.choices[0].message.content;
                if (!content) throw new Error('返回内容为空');
                return content;
            } catch (err) {
                console.error(`[AI] 失败: ${err.code || err.message}`);
                if (endpointIdx === API_ENDPOINTS.length - 1 && attempt === 1) throw err;
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
}

async function runTask(type) {
    const date = getBJTime().toISOString().split('T')[0];
    let prompt = "", title = "";

    if (type === 'ai') {
        title = `今日 AI 科技前沿资讯 (${date})`;
        prompt = `今天是 ${date}。请写 3 条全球重要的 AI 动态。每条包含：[核心事件]、[深度解析]、[行业影响]。总字数不少于 500 字。不要输出网址链接。`;
    } else if (type === 'tcm') {
        title = `小红书·中医养生爆款图文 (${date})`;
        prompt = `你是一个小红书爆款内容策划专家。请生成一篇可直接发布的图文笔记。
【主题】春末夏初中医养生
【格式】
标题：xxx
---
正文：xxx（300-500字）
---
标签：#xxx #xxx`;
    } else if (type === 'pet') {
        title = `小红书·宠物爆款图文 (${date})`;
        prompt = `你是一个小红书宠物领域爆款内容策划专家。请生成一篇可直接发布的图文笔记。
【主题】猫狗换季健康养护
【要求】严禁提到人类
【格式】
标题：xxx
---
正文：xxx（300-500字）
---
标签：#xxx #xxx`;
    } else if (type === 'viral') {
        title = `小红书/视频号爆款带货图文 (${date})`;
        prompt = `你是一个社交电商爆款分析专家和文案写手。请生成以下内容：

【第一部分】当前小红书爆款类目 Top 3
【第二部分】当前微信视频号爆款类目 Top 3
【第三部分】高成交带货文案模板

【第四部分】以下生成3篇可直接发布的小红书图文笔记（每篇包含标题+正文+标签），分别对应不同的爆款类目：

笔记1：
标题：[带emoji的爆款标题]
正文：[300-500字，含产品植入]
标签：#xxx #xxx #xxx

笔记2：
标题：[带emoji的爆款标题]
正文：[300-500字，含产品植入]
标签：#xxx #xxx #xxx

笔记3：
标题：[带emoji的爆款标题]
正文：[300-500字，含产品植入]
标签：#xxx #xxx #xxx

注意：正文要通俗易懂，有干货价值，自然植入产品，符合小红书风格。`;
    }

    console.log(`[${type}] 开始生成...`);
    const content = await callAI(prompt);
    console.log(`[${type}] 生成完毕，长度: ${content.length}。推送中...`);
    await pushMessage(title, content);
    console.log(`[${type}] 完成。`);
}

async function main() {
    const mode = process.argv[2] || 'test';
    const taskList = mode === 'test' ? ['ai', 'tcm', 'pet', 'viral'] : [mode];

    console.log(`--- 启动: ${mode} 模式 ---`);
    for (let i = 0; i < taskList.length; i++) {
        try {
            await runTask(taskList[i]);
        } catch (e) {
            console.error(`❌ [${taskList[i]}] 失败: ${e.message}`);
        }
        if (i < taskList.length - 1) {
            console.log('等待 30 秒后执行下一个...');
            await new Promise(r => setTimeout(r, 30000));
        }
    }
    console.log(`--- ${mode} 模式结束 ---`);
}

main();
