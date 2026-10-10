/**
 * A reference catalogue of model providers, for the picker's "提供商" view.
 *
 * This is **not** a routing table: it does not make a provider available, and nothing here is consulted
 * when a request is sent. It answers one question a reader can have while picking a model — "who makes
 * what, and what did they release?" — so the entries stay at family level on purpose. Exact point
 * releases move every few weeks and a stale number in a reference list is worse than no number, so the
 * list names families and well-known lines, and the view says out loud that it may lag.
 *
 * The list is broad, not exhaustive: it covers the labs whose models a reader actually meets (chat apps,
 * public APIs, open weights) and stops there. Research previews that were never released, in-house-only
 * systems and this month's fine-tune of someone else's weights are deliberately out — as is any entry
 * whose model names could not be stated without guessing.
 *
 * `region` is the two-way split the reader asked for: 国内 / 国外.
 */
export const PROVIDER_CATALOG = [
  // ---------------------------------------------------------------- 国内
  {
    id: 'deepseek', name: 'DeepSeek（深度求索）', region: '国内', site: 'https://www.deepseek.com',
    // Verified against the official API docs on 2026-10-10: the current API models are `deepseek-flash`
    // (DeepSeek-V4.1-Flash) and `deepseek-v4-pro` (DeepSeek-V4-Pro-0813); `deepseek-v4-flash` and
    // `deepseek-v4-flash-vision-exp` are retired. This is the one entry verified against a primary source
    // rather than remembered, and the view marks it as such.
    verified: '2026-10-10',
    models: ['deepseek-flash（DeepSeek-V4.1-Flash，当前默认）', 'deepseek-v4-pro（DeepSeek-V4-Pro-0813）', 'DeepSeek-V3 系列（历史版本）', 'DeepSeek-R1 系列（推理，历史版本）', 'DeepSeek-Coder / DeepSeek-VL（专项与多模态）'],
  },
  {
    id: 'alibaba', name: '阿里云 · 通义千问（Qwen）', region: '国内', site: 'https://tongyi.aliyun.com',
    models: ['Qwen3 / Qwen2.5 开源系列', 'Qwen-Max / Plus / Turbo（商用档位）', 'QwQ（推理）', 'Qwen-Coder（代码）', 'Qwen-VL / Qwen-Audio（多模态）', '通义万相（图像与视频生成）'],
  },
  {
    id: 'moonshot', name: '月之暗面（Kimi）', region: '国内', site: 'https://www.moonshot.cn',
    models: ['Kimi K2 系列', 'Kimi K1.5（推理）', 'moonshot-v1（历史版本）', 'Kimi 视觉与长文本能力'],
  },
  {
    id: 'zhipu', name: '智谱 AI（GLM）', region: '国内', site: 'https://www.zhipuai.cn',
    models: ['GLM-4.5 / GLM-4 系列', 'GLM-Z1（推理）', 'GLM-4V（多模态）', 'CogVLM / CogView（视觉理解与生成）', 'CogVideo（视频生成）'],
  },
  {
    id: 'bytedance', name: '字节跳动 · 豆包（Doubao）', region: '国内', site: 'https://www.volcengine.com/product/doubao',
    models: ['Doubao-pro / Doubao-lite（档位）', 'Doubao-1.5 系列', 'Seed 系列（研究与开源）', '豆包视觉与语音模型', '即梦 / Seedance（图像与视频生成）'],
  },
  {
    id: 'baidu', name: '百度 · 文心（ERNIE）', region: '国内', site: 'https://yiyan.baidu.com',
    models: ['ERNIE 4.5 / ERNIE 4 系列', 'ERNIE Speed / Lite（轻量档）', 'ERNIE 3.5（历史版本）', '文心一格（图像生成）'],
  },
  {
    id: 'tencent', name: '腾讯 · 混元（Hunyuan）', region: '国内', site: 'https://hunyuan.tencent.com',
    models: ['Hunyuan-Large / Turbo / Pro', 'Hunyuan-Vision（多模态）', '混元图像与视频生成', 'Hunyuan 开源系列'],
  },
  {
    id: 'minimax', name: 'MiniMax', region: '国内', site: 'https://www.minimax.io',
    models: ['MiniMax-Text 系列', 'MiniMax M1 / M2（推理）', 'abab 系列（历史版本）', '海螺语音与视频生成'],
  },
  {
    id: 'stepfun', name: '阶跃星辰（Step）', region: '国内', site: 'https://www.stepfun.com',
    models: ['Step-2 / Step-1 系列', 'Step-1V / Step-1X（多模态）', 'Step-Audio（语音）', 'Step-Video（视频生成）'],
  },
  {
    id: '01ai', name: '零一万物（Yi）', region: '国内', site: 'https://www.lingyiwanwu.com',
    models: ['Yi-Large / Yi-Medium（商用）', 'Yi-34B / Yi-6B（开源）', 'Yi-VL（多模态）'],
  },
  {
    id: 'huawei', name: '华为 · 盘古（Pangu）', region: '国内', site: 'https://www.huaweicloud.com/product/pangu.html',
    models: ['盘古大模型系列', '盘古 NLP 与多模态', '盘古气象与科学计算', '昇腾上的行业模型'],
  },
  {
    id: 'shanghai-ai', name: '上海人工智能实验室 · 书生（InternLM）', region: '国内', site: 'https://internlm.intern-ai.org.cn',
    models: ['InternLM 系列（开源）', 'InternLM-XComposer（多模态）', 'InternVL 视觉语言系列', '书生·浦语与科学模型'],
  },
  {
    id: 'modelbest', name: '面壁智能 · MiniCPM', region: '国内', site: 'https://www.modelbest.cn',
    models: ['MiniCPM 系列（端侧）', 'MiniCPM-V（多模态）', 'MiniCPM-o（全模态）'],
  },
  {
    id: 'baichuan', name: '百川智能（Baichuan）', region: '国内', site: 'https://www.baichuan-ai.com',
    models: ['Baichuan 4 系列', 'Baichuan 2 / 3（开源历史版本）', '百川医疗增强模型'],
  },
  {
    id: 'ant', name: '蚂蚁集团 · 百灵（Ling）', region: '国内', site: 'https://www.antgroup.com',
    models: ['Ling / Ring 系列（开源）', '百灵大模型', '蚂蚁多模态与代码模型'],
  },
  {
    id: '360', name: '360 · 智脑', region: '国内', site: 'https://ai.360.com',
    models: ['360 智脑系列', '360 多模态与安全模型'],
  },
  {
    id: 'sensetime', name: '商汤 · 日日新（SenseNova）', region: '国内', site: 'https://www.sensetime.com',
    models: ['SenseChat 系列', '日日新 5.x 系列', '商量多模态与视觉模型', '如影 / 秒画（数字人与生成）'],
  },
  {
    id: 'iflytek', name: '科大讯飞 · 星火（Spark）', region: '国内', site: 'https://xinghuo.xfyun.cn',
    models: ['星火 4.0 / 3.5 系列', 'Spark Lite / Pro / Max（档位）', '星火语音与多模态'],
  },
  {
    id: 'kunlun', name: '昆仑万维 · 天工（Skywork）', region: '国内', site: 'https://www.tiangong.cn',
    models: ['天工 3.0 / 2.0 系列', 'Skywork 开源系列', '天工音乐与视频生成'],
  },
  {
    id: 'xverse', name: '元象 · XVERSE', region: '国内', site: 'https://www.xverse.cn',
    models: ['XVERSE 系列（开源）', 'XVERSE-V（多模态）', 'XVERSE-MoE'],
  },
  {
    id: 'meituan', name: '美团 · LongCat', region: '国内', site: 'https://www.meituan.com',
    models: ['LongCat 系列（开源）', '美团行业场景模型'],
  },
  {
    id: 'vivo', name: 'vivo · 蓝心（BlueLM）', region: '国内', site: 'https://www.vivo.com',
    models: ['BlueLM 系列（端侧）', '蓝心大模型云端版', '蓝心多模态'],
  },
  {
    id: 'xiaomi', name: '小米 · MiLM', region: '国内', site: 'https://www.mi.com',
    models: ['MiLM 系列（端侧）', '小米多模态与语音'],
  },
  {
    id: 'oppo', name: 'OPPO · AndesGPT', region: '国内', site: 'https://www.oppo.com',
    models: ['AndesGPT 系列（端侧）', 'OPPO 多模态'],
  },
  {
    id: 'cas', name: '中科院 · 紫东太初', region: '国内', site: 'https://www.ia.ac.cn',
    models: ['紫东太初系列（多模态）', '紫东太初开放平台'],
  },
  {
    id: 'netease', name: '网易 · 伏羲 / 玉言', region: '国内', site: 'https://fuxi.163.com',
    models: ['玉言系列（开源）', '伏羲行业模型与数字人'],
  },
  {
    id: 'jd', name: '京东 · 言犀', region: '国内', site: 'https://www.jd.com',
    models: ['言犀系列', '京东零售与供应链场景模型'],
  },
  {
    id: 'kuaishou', name: '快手 · 快意 / 可灵', region: '国内', site: 'https://www.kuaishou.com',
    models: ['KwaiYii（快意）语言模型', '可灵 Kling（视频生成）', '快手多模态模型'],
  },
  {
    id: 'mobvoi', name: '出门问问 · 序列猴子', region: '国内', site: 'https://www.mobvoi.com',
    models: ['序列猴子系列', '出门问问语音与生成模型'],
  },
  {
    id: 'langboat', name: '澜舟科技 · 孟子', region: '国内', site: 'https://www.langboat.com',
    models: ['孟子系列（开源与商用）', '澜舟金融与文档模型'],
  },
  {
    id: 'baai', name: '智源研究院 · Aquila / Emu', region: '国内', site: 'https://www.baai.ac.cn',
    models: ['Aquila 系列（开源）', 'Emu 多模态系列', '悟道系列（历史版本）'],
  },
  {
    id: 'intellif', name: '云天励飞 · 云天天书', region: '国内', site: 'https://www.intellif.com',
    models: ['云天天书系列', '边缘视觉与多模态模型'],
  },

  // ---------------------------------------------------------------- 国外
  {
    id: 'openai', name: 'OpenAI', region: '国外', site: 'https://openai.com',
    models: ['GPT-5 系列', 'GPT-4.1 / GPT-4o', 'o 系列（推理）', 'Codex（编码）', 'GPT-3.5（历史版本）', 'Whisper（语音）', 'DALL·E / Sora（生成）'],
  },
  {
    id: 'anthropic', name: 'Anthropic · Claude', region: '国外', site: 'https://www.anthropic.com',
    models: ['Claude Opus 系列', 'Claude Sonnet 系列', 'Claude Haiku 系列（轻量）', 'Claude 3.x / 2（历史版本）'],
  },
  {
    id: 'google', name: 'Google · Gemini', region: '国外', site: 'https://deepmind.google/models/gemini/',
    models: ['Gemini 2.5 Pro / Flash', 'Gemini 2.0 系列', 'Gemma（开源）', 'PaLM 2（历史版本）', 'Imagen / Veo（生成）'],
  },
  {
    id: 'meta', name: 'Meta · Llama', region: '国外', site: 'https://www.llama.com',
    models: ['Llama 4 系列', 'Llama 3.x 系列', 'Llama 2（历史版本）', 'Code Llama'],
  },
  {
    id: 'mistral', name: 'Mistral AI', region: '国外', site: 'https://mistral.ai',
    models: ['Mistral Large / Medium / Small', 'Magistral（推理）', 'Codestral / Devstral（代码）', 'Pixtral（多模态）'],
  },
  {
    id: 'xai', name: 'xAI · Grok', region: '国外', site: 'https://x.ai',
    models: ['Grok 4 系列', 'Grok 3 系列', 'Grok 2（历史版本）', 'Grok 视觉与图像生成'],
  },
  {
    id: 'cohere', name: 'Cohere', region: '国外', site: 'https://cohere.com',
    models: ['Command A', 'Command R+ / R', 'Embed / Rerank（检索配套）', 'Aya（开源多语）'],
  },
  {
    id: 'amazon', name: 'Amazon · Nova', region: '国外', site: 'https://aws.amazon.com/ai/generative-ai/nova/',
    models: ['Nova Premier / Pro', 'Nova Lite / Micro', 'Nova Canvas / Reel（生成）', 'Titan（历史版本）'],
  },
  {
    id: 'microsoft', name: 'Microsoft · Phi', region: '国外', site: 'https://azure.microsoft.com/products/ai-foundry',
    models: ['Phi-4 系列', 'Phi-3 系列', 'Azure OpenAI 上的 OpenAI 模型'],
  },
  {
    id: 'ai21', name: 'AI21 Labs', region: '国外', site: 'https://www.ai21.com',
    models: ['Jamba 系列', 'Jurassic（历史版本）'],
  },
  {
    id: 'nvidia', name: 'NVIDIA · Nemotron', region: '国外', site: 'https://build.nvidia.com',
    models: ['Nemotron 系列', 'NeMo 微调与工具链', 'NIM 推理微服务'],
  },
  {
    id: 'allenai', name: 'Allen Institute · OLMo', region: '国外', site: 'https://allenai.org',
    models: ['OLMo 2 系列（完全开源）', 'Tülu（指令微调）', 'Molmo（多模态）'],
  },
  {
    id: 'perplexity', name: 'Perplexity', region: '国外', site: 'https://www.perplexity.ai',
    models: ['Sonar 系列（联网检索）', '基于第三方模型的在线问答'],
  },
  {
    id: 'tii', name: 'TII · Falcon', region: '国外', site: 'https://falconllm.tii.ae',
    models: ['Falcon 系列（开源）', 'Falcon-H1 / Falcon 2', 'Falcon 视觉与嵌入模型'],
  },
  {
    id: 'databricks', name: 'Databricks · DBRX', region: '国外', site: 'https://www.databricks.com',
    models: ['DBRX（开源 MoE）', 'Mosaic 训练栈', 'Databricks 上的第三方模型'],
  },
  {
    id: 'ibm', name: 'IBM · Granite', region: '国外', site: 'https://www.ibm.com/granite',
    models: ['Granite 系列（开源）', 'Granite Code（代码）', 'watsonx 上的企业模型'],
  },
  {
    id: 'snowflake', name: 'Snowflake · Arctic', region: '国外', site: 'https://www.snowflake.com',
    models: ['Arctic 系列（开源）', 'Cortex 上的第三方模型'],
  },
  {
    id: 'reka', name: 'Reka AI', region: '国外', site: 'https://www.reka.ai',
    models: ['Reka Core / Flash / Edge', 'Reka 多模态系列'],
  },
  {
    id: 'aleph-alpha', name: 'Aleph Alpha', region: '国外', site: 'https://www.aleph-alpha.com',
    models: ['Luminous 系列', 'Pharia 系列'],
  },
  {
    id: 'naver', name: 'Naver · HyperCLOVA X', region: '国外', site: 'https://clova.ai',
    models: ['HyperCLOVA X 系列', 'CLOVA 语音与视觉'],
  },
  {
    id: 'yandex', name: 'Yandex · YandexGPT', region: '国外', site: 'https://ya.ru/ai',
    models: ['YandexGPT 系列', 'Yandex 视觉与语音模型'],
  },
  {
    id: 'samsung', name: 'Samsung · Gauss', region: '国外', site: 'https://www.samsung.com',
    models: ['Gauss 系列（端侧与云端）', 'Samsung 多模态'],
  },
  {
    id: 'apple', name: 'Apple · Apple Intelligence', region: '国外', site: 'https://www.apple.com/apple-intelligence/',
    models: ['Apple Intelligence 基础模型（端侧与云端）', 'OpenELM（开源）', 'Apple 视觉与语音模型'],
  },
  {
    id: 'stability', name: 'Stability AI', region: '国外', site: 'https://stability.ai',
    models: ['StableLM 系列', 'Stable Diffusion 系列', 'Stable Audio / Video'],
  },
  {
    id: 'inflection', name: 'Inflection AI', region: '国外', site: 'https://inflection.ai',
    models: ['Inflection 系列', 'Pi 助手'],
  },
  {
    id: 'writer', name: 'Writer · Palmyra', region: '国外', site: 'https://writer.com',
    models: ['Palmyra 系列', 'Writer 企业知识模型'],
  },
  {
    id: 'liquid', name: 'Liquid AI · LFM', region: '国外', site: 'https://www.liquid.ai',
    models: ['LFM 系列（端侧）', 'Liquid 基础模型'],
  },
  {
    id: 'together', name: 'Together AI', region: '国外', site: 'https://www.together.ai',
    models: ['开源模型的托管与微调', '自研推理栈'],
  },
];

/** Regions in display order, so the view can group without hardcoding the split twice. */
export const PROVIDER_REGIONS = ['国内', '国外'];

/** The catalogue, grouped by region and in the order above. */
export function providerGroups(catalog = PROVIDER_CATALOG) {
  return PROVIDER_REGIONS
    .map(region => ({ region, providers: catalog.filter(provider => provider.region === region) }))
    .filter(group => group.providers.length > 0);
}
