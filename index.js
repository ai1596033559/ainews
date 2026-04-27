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
        title = `小红书近一年爆火品类 Top20 分析 (${date})`;
        prompt = `你是一个长期深耕小红书的电商运营老兵，这几年跑通了小红书的爆品逻辑。现在你要用"给同行分享"的语气，拆解近一年小红书上真正爆火的品类。

要求：语气像业内人士交流，别说废话套话。

请输出以下内容，每一条都要有分析价值：

【小红书近一年爆火品类 Top20 + 转化率排名】

格式要求每个品类写：
排名 | 品类名称 | 爆火原因（一句话说透） | 目标人群画像 | 客单价区间 | 转化率预估（高/中高/中/低） | 代表品牌或账号案例

按转化率从高到低排列，前5个重点展开分析（为什么转化率高、什么人在买、怎么做内容）。

后15个每个写两三句话就行。

最后总结：
1. 现在入局小红书，哪3个品类最值得做？
2. 哪3个品类已经饱和不建议再进了？
3. 2026年下半年最可能爆的3个品类预测

全程不要输出网址链接。`;
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
