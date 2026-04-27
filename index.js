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
        prompt = `你是科技博主，用大白话给普通人讲今天最重要的 AI 新闻。用朋友聊天的语气写。

今天是 ${date}。

要求写 2 条重磅 AI 动态，每条包含：
1. 【发生了啥】— 一句话说清楚
2. 【举个例子】— 打个比方或者举个生活例子，让大爷大妈都能懂
3. 【关我啥事】— 对普通人生活、工作的实际影响
4. 【我的看法】— 一句个人观点，带点态度

别写成百度百科，别用官腔，别说大空话。就像你跟朋友吃饭时聊天那样。每条 200 字左右，不要输出网址。`;
    } else if (type === 'tcm') {
        title = `小红书·中医养生图文 (${date})`;
        prompt = `你是邻居大姐，特别会养生，在小红书上分享经验有好几万粉丝。现在你要写一篇笔记，语气要像跟闺蜜聊天。

【主题】春末夏初身体不舒服？很可能是"湿气"搞的鬼

【必须包含】
1. 开场说自己的亲身经历（比如："上个月我总觉得浑身没劲，早上起来眼皮肿，大便还粘马桶..."）
2. 用家常话解释湿气是啥（别整中医术语，就说"像身体里下了一场连绵雨"这样的比喻）
3. 自测清单（3-4条，口语化："你中的越多，湿气越重"）
4. 几个简单好操作的调理方法（食材家里都有的，比如赤小豆薏米水）
5. 自然带一句产品推荐（比如某某祛湿茶、某某艾草贴，要像朋友安利好物）

【语气】口语化、有真实感、像在分享不是在上课
【字数】500-800字
【标签】#湿气重 #养生日常 #中医养生 #祛湿 #好物分享`;
    } else if (type === 'pet') {
        title = `小红书·宠物健康图文 (${date})`;
        prompt = `你是一个养猫/狗多年的资深铲屎官，在小红书分享养宠经验有好几万粉丝。现在写一篇笔记，语气要像跟养宠物的朋友交流。

【主题】换季了，你家毛孩子是不是也开始"作妖"了？

【必须包含】
1. 开场说自家毛孩子的真实情况（比如："我家布丁一到春天就开始疯狂掉毛，还老舔爪子..."）
2. 猫狗换季常见的几个问题（掉毛、软便、没精神），用生活场景描述
3. 为什么会出现这些问题（简单讲两句生理原因，别学术化）
4. 你自己用过有效的解决方法（吃什么、用什么、怎么护理）
5. 自然带一句产品推荐（鱼油、益生菌这些，像"我家一直在吃XX，确实好了很多"）

【要求】严禁提到人类养生，全程只讲猫狗
【语气】有经验的铲屎官分享经验，不是专家讲课
【字数】500-800字
【标签】#养宠经验 #猫狗换季 #宠物健康 #铲屎官必看 #好物推荐`;
    } else if (type === 'viral') {
        title = `小红书/视频号爆款带货图文 (${date})`;
        prompt = `你是一个在多个平台带货的资深玩家，自己跑通了小红书和视频号的爆款逻辑。现在你要用分享经验的方式，写一份"内部人视角"的爆款拆解。

语气就像你跟想做副业的朋友吃饭聊天，别整那些"公域流量、私域转化"的术语。

【第一部分】小红书最近什么最好卖？（Top 3 类目，每个简单说）
- 为什么这个类目火了（用买家视角，不说空话）
- 什么人会在小红书买（具体画像，比如"25-35岁宝妈，娃2-5岁"）

【第二部分】视频号最近什么最好卖？（Top 3 类目，每个简单说）
- 为什么这个类目火了
- 什么人会在视频号买

【第三部分】一套高成交的带货文案模板（小红书版+视频号版各一套）
- 不要教条，要"我试过这样写，转化确实高"的语气
- 给出具体的话术示例

【第四部分】生成2篇完整的小红书图文笔记，可以直接复制发布的那种

笔记1（偏爆款测评风格）：
标题：[带emoji，有悬念或痛点]
正文：[400-600字，口语化，有具体使用场景和效果描述，像真实买家秀]
标签：#xxx #xxx

笔记2（偏干货科普风格）：
标题：[带emoji，有价值感]
正文：[400-600字，口语化，有个人经验+生活例子+自然植入产品]
标签：#xxx #xxx

关键：两篇都要像真实用户写的，不要像广告。要有具体的细节（比如"用了第三天，明显感觉..."），让读者觉得真实可信。`;
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
