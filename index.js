const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;
const PUSHPLUS_TOKEN = process.env.PUSHPLUS_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const USE_GITHUB_MODELS = !!GITHUB_TOKEN;

if (!DEEPSEEK_API_KEY && !GITHUB_TOKEN) {
    console.error('❌ 请设置环境变量 DEEPSEEK_API_KEY 或 GITHUB_TOKEN');
    process.exit(1);
}

const getBJTime = () => new Date(new Date().getTime() + (8 * 60 * 60 * 1000));

async function pushToFeishu(title, content) {
    if (!FEISHU_WEBHOOK) {
        console.log('[飞书] 未配置 FEISHU_WEBHOOK，跳过');
        return;
    }
    const chunkSize = 3000;
    const chunks = [];
    for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
    }
    for (let i = 0; i < chunks.length; i++) {
        const chunkTitle = chunks.length > 1 ? `${title} (${i+1}/${chunks.length})` : title;
        try {
            console.log(`[飞书] 发送 ${i+1}/${chunks.length} ...`);
            await axios.post(FEISHU_WEBHOOK, {
                msg_type: "text",
                content: { text: `【${chunkTitle}】\n\n${chunks[i]}` }
            }, { timeout: 30000 });
            console.log(`✅ [飞书] [${chunkTitle}] 成功`);
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(`❌ [飞书] [${chunkTitle}] 失败: ${e.message}`);
        }
    }
}

async function pushToWechat(title, content) {
    if (!PUSHPLUS_TOKEN) return;
    try {
        console.log(`[PushPlus] 推送: ${title}`);
        await axios.post('http://www.pushplus.plus/send', {
            token: PUSHPLUS_TOKEN,
            title: title,
            content: content,
            template: 'txt'
        }, { timeout: 30000 });
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

async function callAI(prompt, retries = 2) {
    if (USE_GITHUB_MODELS) {
        return await callGitHubModels(prompt);
    }
    return await callDeepSeek(prompt, retries);
}

async function callGitHubModels(prompt) {
    const res = await axios.post(
        'https://models.inference.ai.azure.com/chat/completions',
        {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "你是一个专业的内容创作助手。" },
                { role: "user", content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 4000
        },
        {
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            timeout: 120000
        }
    );
    const content = res.data.choices[0].message.content;
    if (!content) throw new Error('GitHub Models 返回内容为空');
    return content;
}

async function callDeepSeek(prompt, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.post('https://api.deepseek.com/chat/completions', {
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "你是一个专业的内容创作助手。" },
                    { role: "user", content: prompt }
                ],
                temperature: 0.8
            }, {
                headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
                timeout: 300000
            });
            const content = res.data.choices[0].message.content;
            if (!content) throw new Error('DeepSeek 返回内容为空');
            return content;
        } catch (err) {
            console.error(`[DeepSeek] 第 ${attempt}/${retries} 次失败: ${err.message}`);
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

async function runTask(type) {
    const date = getBJTime().toISOString().split('T')[0];
    let prompt = "";
    let title = "";

    if (type === 'ai') {
        title = `今日 AI 科技前沿资讯 (${date})`;
        prompt = `今天是 ${date}。请写 3 条全球重要的 AI 动态。
每条包含：[核心事件]、[深度解析]、[行业影响]。
总字数不少于 500 字。不要输出网址链接。`;
    } else if (type === 'tcm') {
        title = `小红书·中医养生爆款图文 (${date})`;
        prompt = `你是一个小红书爆款内容策划专家。请生成一篇可直接发布的图文笔记。

【主题】春末夏初中医养生
【要求】
1. 一个爆款标题（带emoji）
2. 正文（300-500字）：包含症状自测、中医原理、养生建议
3. 3-5个标签

格式要求：
标题：xxx
---
正文：xxx
---
标签：xxx`;
    } else if (type === 'pet') {
        title = `小红书·宠物爆款图文 (${date})`;
        prompt = `你是一个小红书宠物领域爆款内容策划专家。请生成一篇可直接发布的图文笔记。

【主题】猫狗换季健康养护
【要求】
1. 一个爆款标题（带emoji）
2. 正文（300-500字）：包含宠物生理特点、换季常见问题、养护建议
3. 严禁提到人类
4. 3-5个标签

格式要求：
标题：xxx
---
正文：xxx
---
标签：xxx`;
    } else if (type === 'viral') {
        title = `小红书/视频号爆款带货分析 (${date})`;
        prompt = `你是一个社交电商爆款分析专家。请输出以下内容：

【第一部分】当前小红书的爆款类目 Top 5
- 每个类目说明为什么火
- 目标人群分析

【第二部分】当前微信视频号爆款类目 Top 5
- 每个类目说明为什么火
- 目标人群分析

【第三部分】高成交带货脚本模板
- 一个通用的爆款带货文案框架
- 适配小红书风格
- 适配视频号风格

【第四部分】可直接发布的小红书图文笔记（完整一篇）
- 爆款标题
- 正文（含产品植入）
- 标签

字数不限，越详细越有价值。`;
    }

    console.log(`[${type}] 开始生成...`);
    const content = await callAI(prompt);
    console.log(`[${type}] 生成完毕，长度: ${content.length}。推送中...`);
    await pushMessage(title, content);
    console.log(`[${type}] 完成。`);
}

async function main() {
    const mode = process.argv[2] || 'test';

    const taskList = mode === 'test'
        ? ['ai', 'tcm', 'pet', 'viral']
        : [mode];

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
