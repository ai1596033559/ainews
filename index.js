const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK;

if (!DEEPSEEK_API_KEY || !FEISHU_WEBHOOK) {
    console.error('❌ 请设置环境变量 DEEPSEEK_API_KEY 和 FEISHU_WEBHOOK');
    process.exit(1);
}

const getBJTime = () => new Date(new Date().getTime() + (8 * 60 * 60 * 1000));

async function pushMessage(title, content) {
    console.log(`[推送] 准备推送: ${title}，内容长度: ${content.length}`);

    const chunks = [];
    const chunkSize = 3000;
    for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i++) {
        const chunkTitle = chunks.length > 1 ? `${title} (第${i+1}/${chunks.length}部分)` : title;
        const payload = {
            msg_type: "text",
            content: { text: `【${chunkTitle}】\n\n${chunks[i]}` }
        };
        try {
            console.log(`[推送] 正在发送分段 ${i+1}/${chunks.length} ...`);
            await axios.post(FEISHU_WEBHOOK, payload, { timeout: 30000 });
            console.log(`✅ [推送] [${chunkTitle}] 发送成功`);
            if (chunks.length > 1 && i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            console.error(`❌ [推送] [${chunkTitle}] 失败: ${e.message}`);
        }
    }
}

async function callDeepSeek(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.post('https://api.deepseek.com/chat/completions', {
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "你是一个绝不报错、绝不提供虚假链接、文笔极佳的专业内容官。" },
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
            console.error(`[DeepSeek] 第 ${attempt}/${retries} 次请求失败: ${err.message}`);
            if (attempt === retries) throw err;
            const wait = attempt * 5000;
            console.log(`[DeepSeek] 等待 ${wait}ms 后重试...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
}

async function runTask(type) {
    const date = getBJTime().toISOString().split('T')[0];
    let prompt = "";
    let title = "";

    if (type === 'ai') {
        title = `今日 AI 科技前沿资讯 (${date})`;
        prompt = `今天是 ${date}。请总结今日 3 条全球最重大的 AI 动态。
【极致禁令】：严禁输出任何以 http 或 https 开头的网址链接！
【内容要求】：每条动态必须包含 [核心事件]、[深度解析]、[行业影响]。总字数不少于 800 字。
即便无法获取实时新闻，也要基于 2025 年行业大势给出硬核情报。`;
    } else if (type === 'tcm') {
        title = `🌿 小红书·中医人养生策划 (${date})`;
        prompt = `请策划一篇针对人类（严禁宠物）的春末夏初中医科普+产品带货笔记。
包含：爆款标题、针对人的症状自测（如乏力、湿重）、中医原理解析、产品植入方案。
字数要求：详细、深度、总字数在 1000 字左右，符合小红书爆款风格。`;
    } else if (type === 'pet') {
        title = `🐾 小红书·宠物科学养生策划 (${date})`;
        prompt = `请策划一篇针对猫狗换季健康的科普+带货笔记。
包含：宠物专属标题、猫狗生理特征解析、鱼油/益生菌产品植入。
要求：严禁提到人类！内容极度专业，总字数在 1000 字左右。`;
    }

    console.log(`[${type}] 任务开始。正在请求 DeepSeek API...`);
    const content = await callDeepSeek(prompt);
    console.log(`[${type}] DeepSeek 内容生成完毕，长度: ${content.length}。开始推送...`);
    await pushMessage(title, content);
    console.log(`[${type}] 推送完成。`);
}

async function main() {
    const mode = process.argv[2] || 'test';
    const exitOnError = process.env.EXIT_ON_ERROR !== 'false';

    try {
        if (mode === 'test') {
            console.log("--- 启动手动测试模式 ---");
            await runTask('ai');
            await new Promise(r => setTimeout(r, 15000));
            await runTask('tcm');
            await new Promise(r => setTimeout(r, 15000));
            await runTask('pet');
            console.log("--- 手动测试模式结束 ---");
        } else {
            await runTask(mode);
        }
    } catch (e) {
        console.error(`❌ 任务执行崩溃: ${e.message}`);
        if (exitOnError) process.exit(1);
    }

    if (exitOnError) process.exit(0);
}

main();
