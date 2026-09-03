import type { Bi } from '../lang'

export type District = 'arena' | 'pipes' | 'tools'

export type Work = {
  slug: string
  name: Bi
  tagline: Bi
  detail: Bi
  district: District
  year: number
  stack: string[]
  live?: string
  source?: string
  stars?: number
}

export const districts: { id: District; label: Bi; blurb: Bi }[] = [
  {
    id: 'arena',
    label: { en: 'Arenas', zh: '竞技场' },
    blurb: {
      en: 'Where an Agent is a player, not a chatbot. It writes the strategy; the server runs it; people watch.',
      zh: 'Agent 在这里是玩家，不是聊天机器人。它写策略，服务端跑，人在旁边看。',
    },
  },
  {
    id: 'pipes',
    label: { en: 'Pipes', zh: '管道' },
    blurb: {
      en: 'What an Agent runs on: sandboxes, streams, keys, settlement. Each one changes the shape of a problem.',
      zh: 'Agent 脚下的东西：沙箱、流、密钥、结算。每一件都在改问题的形状。',
    },
  },
  {
    id: 'tools',
    label: { en: 'Tools', zh: '工具' },
    blurb: {
      en: 'Things an Agent, or a person, can pick up and use. Two of them are tricks that got popular.',
      zh: 'Agent 或人都能拿起来就用的东西。其中两件是传开了的小把戏。',
    },
  },
]

export const works: Work[] = [
  {
    slug: 'jianghu',
    name: { en: 'Jianghu Lunjian', zh: '江湖论剑' },
    tagline: {
      en: 'A 1v1 wuxia duel: a person picks the sect, an AI writes the heart-method.',
      zh: '人定门派，AI 写心诀的武侠对决。',
    },
    detail: {
      en: "Eight sects, forty skills, a 14×14 arena with streams, fog and spirit springs. Every frame the server runs each fighter's JavaScript inside an in-process QuickJS sandbox, so an Agent can iterate its script through a plain HTTP API: simulate, diff, publish, challenge. Fourteen ranks on the ladder; the top three carry their own titles.",
      zh: '八大门派、四十招式、一张 14×14 带溪流、雾林和灵泉的战场。每一帧，服务端在进程内的 QuickJS 沙箱里跑双方的 JavaScript 心法，Agent 通过一套普通的 HTTP 接口迭代自己的脚本：模拟、比对、发布、挑战。十四段位，前三名各有尊号。',
    },
    district: 'arena',
    year: 2026,
    stack: ['Rust', 'axum', 'QuickJS', 'PostgreSQL', 'React 19', 'Vike', 'GSAP'],
    live: 'https://jianghu.gtio.work',
  },
  {
    slug: 'lark-arena',
    name: { en: 'Yejú', zh: '夜局' },
    tagline: {
      en: "Hold'em and Werewolf inside a Feishu group chat, with LLM players filling the empty seats.",
      zh: '飞书群里开德扑和狼人杀，缺人用 AI 玩家凑。',
    },
    detail: {
      en: 'Drops into any group. Interactive cards give each player a private view while the room sees only the public log. The AI seats each have a persona, so the maniac plays like a maniac. Chip stacks survive restarts in an embedded ACID store; a u64 bitmask seven-card evaluator and parallel Monte Carlo keep the equity math instant.',
      zh: '拉进任意群就能开局。交互卡片给每个玩家私密视角，群里只看到公开播报。AI 座位各有人设，莽哥真的会莽。筹码存在嵌入式 ACID 库里，重启不丢；u64 位掩码七张牌评估器加并行蒙特卡洛，算胜率不需要等。',
    },
    district: 'arena',
    year: 2026,
    stack: ['Rust', 'axum', 'redb', 'Feishu Card 2.0', 'rayon'],
    source: 'https://github.com/gtoxlili/lark-arena',
  },
  {
    slug: 'codemode-go',
    name: { en: 'codemode-go', zh: 'codemode-go' },
    tagline: {
      en: 'Programmatic tool calling for Go Agents: the model writes one program that calls the tools it already has.',
      zh: 'Go Agent 的程序化工具调用：模型写一段程序，去调它已有的工具。',
    },
    detail: {
      en: 'Not a replacement for tool calling, a second strategy beside it. Bind the registry in a few lines and the model gains one tool, run_code, that runs JavaScript in-process on goja. Promise.all becomes real parallelism, intermediate results never enter the context, and conflict keys keep a write and a read of the same file from overlapping. Pulled out of an Agent that runs it in production.',
      zh: '不是替代工具调用，是并列的第二条路。几行代码绑定现有注册表，模型多得一个 run_code 工具，在进程内的 goja 里跑 JavaScript。Promise.all 是真并行，中间结果不进上下文，冲突键让同一文件的读写不会互相踩。从一个线上跑着的 Agent 里抽出来的。',
    },
    district: 'pipes',
    year: 2026,
    stack: ['Go', 'goja'],
    source: 'https://github.com/gtoxlili/codemode-go',
  },
  {
    slug: 'keyward',
    name: { en: 'Keyward', zh: 'Keyward' },
    tagline: {
      en: 'Route the work to the key, never the key to the work. Non-custodial BYOK, like WalletConnect for API keys.',
      zh: '把工作送到密钥那里，而不是把密钥送去工作。非托管的 BYOK 协议。',
    },
    detail: {
      en: 'A provider key is a static bearer token, so something must hold the plaintext at the moment of the call. Keyward makes that something a Client run by whoever owns the key. The app points its base URL at a Node that holds no key and relays each request as a work intent; the Client attaches the key, calls the provider and streams the result back. The app never knows. Wire spec drafted, Rust reference client runs, mid-stream resume demo included.',
      zh: 'API key 是静态 bearer token，调用那一刻总得有个东西拿着明文。Keyward 让那个东西是密钥主人自己跑的 Client。应用把 base URL 指向一个不持有任何密钥的 Node，Node 把请求当作「工作意图」转给这个 Client；Client 本地附上密钥、调用上游、把结果流回去。应用全程不知情。协议草案已定，Rust 参考实现能跑，附带断流续传演示。',
    },
    district: 'pipes',
    year: 2026,
    stack: ['Rust', 'Protocol spec', 'Apache-2.0'],
    source: 'https://github.com/gtoxlili/keyward',
  },
  {
    slug: 'streamhub',
    name: { en: 'streamhub', zh: 'streamhub' },
    tagline: {
      en: 'Resumable LLM streaming for Go, backed by Redis. The stream survives the reconnect.',
      zh: 'Go 的可续传 LLM 流，Redis 背书。断线了，流还在。',
    },
    detail: {
      en: "For when the code producing a stream and the code consuming it don't share a lifetime, or even an instance. Chunks persist in Redis Streams so a subscriber replays what it missed, cancel signals ride Pub/Sub so a generation can be stopped from anywhere, and a generation ID fences producers so only one owns a session.",
      zh: '生产流的代码和消费流的代码不在同一个生命周期里，甚至不在同一台实例上时用它。分片落在 Redis Streams 里，订阅者能补上错过的部分；取消信号走 Pub/Sub，从任何地方都能叫停一次生成；generation ID 做栅栏，一个会话只有一个生产者。',
    },
    district: 'pipes',
    year: 2026,
    stack: ['Go', 'Redis Streams', 'rueidis'],
    source: 'https://github.com/gtoxlili/streamhub',
  },
  {
    slug: 'defai-relay',
    name: { en: 'DeFAI Relay', zh: 'DeFAI Relay' },
    tagline: {
      en: 'Every model, one endpoint, paid from a wallet. An LLM gateway with sign-in-with-Ethereum and USDC top-ups.',
      zh: '所有模型，一个端点，用钱包付款的 LLM 网关。',
    },
    detail: {
      en: 'It speaks both the OpenAI and Anthropic wire formats, meters tokens cache-aware (fresh, cache-read, cache-write and output priced separately) and settles against a USDC ledger. Deposits arrive as native USDC transfers on Base, Arbitrum, Ethereum and friends, confirmed per chain by leader-elected pollers. The pictures on this page were paid for through it.',
      zh: '同时讲 OpenAI 和 Anthropic 两种协议，按 token 做缓存感知计量（fresh、cache-read、cache-write、output 分别计价），对着 USDC 账本结算。充值是 Base、Arbitrum、Ethereum 等链上的原生 USDC 转账，每条链由选主的轮询器确认入账。这一页上的图，就是经它付的钱。',
    },
    district: 'pipes',
    year: 2026,
    stack: ['Rust', 'axum', 'alloy', 'SIWE', 'Cloudflare D1', 'React Router 7', 'wagmi'],
    live: 'https://defai.gtio.work',
  },
  {
    slug: 'wechat-finder-dlna',
    name: { en: 'wechat-finder-dlna', zh: 'wechat-finder-dlna' },
    tagline: {
      en: 'Pretends to be a TV on the LAN, and WeChat hands over the live-stream URL. No proxy, no certificate, nothing to detect.',
      zh: '在局域网里装成一台电视，视频号就把直播流地址交出来。不抓包、不装证书、无从检测。',
    },
    detail: {
      en: 'Advertises itself over SSDP, mDNS and Cast at once, so DLNA, AirPlay 2 and Chromecast all work. Cast from the phone; the app sends the real m3u8; the tool prints it or pipes it into ffmpeg. Python on PyPI, and an async Rust rewrite on crates.io.',
      zh: '同时用 SSDP、mDNS 和 Cast 协议广播自己，DLNA、AirPlay 2、Chromecast 三种投屏都吃。手机上点投屏，应用把真实的 m3u8 发过来，工具打印出来或者直接喂给 ffmpeg。Python 版在 PyPI，异步 Rust 重写版在 crates.io。',
    },
    district: 'tools',
    year: 2026,
    stack: ['Python', 'Rust', 'Tokio', 'DLNA', 'AirPlay 2', 'Cast v2'],
    source: 'https://github.com/gtoxlili/wechat-finder-dlna',
    stars: 135,
  },
  {
    slug: 'scriptorium',
    name: { en: 'Scriptorium', zh: 'Scriptorium' },
    tagline: {
      en: 'Sandbox execution middleware: spawns an isolated container on demand for whatever an Agent needs to run.',
      zh: '沙箱执行中间件：Agent 要跑什么，就按需拉起一个隔离容器。',
    },
    detail: {
      en: 'A gRPC service that owns container lifecycle, workspace bind-mounts, CPU, memory and pid caps, wall-clock timeouts, SSRF-guarded URL ingress and artifact delivery to object storage. The calling Agent sees one synchronous-looking RPC; scripts, RPA flows and browser automation run somewhere else entirely.',
      zh: '一个 gRPC 服务，管容器生命周期、工作区挂载、CPU、内存和进程数上限、墙钟超时、防 SSRF 的 URL 拉取和产物上传到对象存储。调用方看到的只是一次同步的 RPC；脚本、RPA、浏览器自动化都在别处跑。',
    },
    district: 'pipes',
    year: 2026,
    stack: ['Rust', 'tonic gRPC', 'bollard', 'Docker', 'S3'],
  },
  {
    slug: 'deckforge',
    name: { en: 'DeckForge', zh: 'DeckForge' },
    tagline: {
      en: 'A presentation engine for AI Agents: one command to install, one to read the method, and it exports PPTX that stays editable.',
      zh: '面向 Agent 的演示文稿引擎：一条命令安装，一条命令取回方法论，导出原生可编辑的 PPTX。',
    },
    detail: {
      en: 'Decks are a strict YAML source format, design systems come as whole recipes rather than templates, and the PPTX is written by a home-grown OOXML writer so text, shapes, tables and six chart types stay real objects. A forced visual QA loop renders every page back to the Agent before it is allowed to finish. Nothing downloads at runtime.',
      zh: 'deck 是严格解析的 YAML 源码，设计系统是成套配方而不是模板，PPTX 由自研 OOXML 写入器生成，文字、形状、表格和六类图表在 PowerPoint 里都是真对象。强制的视觉 QA 闭环把每一页截图还给 Agent，检查过才算完成。运行期不下载任何东西。',
    },
    district: 'tools',
    year: 2026,
    stack: ['Go', 'OOXML', 'Chrome DevTools', 'Claude Code skill'],
    live: 'https://deckforge.gtio.work',
    source: 'https://github.com/gtoxlili/deckforge',
  },
  {
    slug: 'wechat-chatgpt',
    name: { en: 'wechat-chatGPT', zh: 'wechat-chatGPT' },
    tagline: {
      en: 'ChatGPT answering inside a WeChat official account, six days after ChatGPT existed.',
      zh: 'ChatGPT 出来第六天，让它在微信公众号里回消息。',
    },
    detail: {
      en: "December 2022: no API yet, so this reverse-engineered the web session and fitted it behind WeChat's passive-reply endpoint. WeChat retries a slow reply three times; a single-flight design made sure those retries never fanned out into three generations. It found 378 stars and 120 forks before the official API made it unnecessary.",
      zh: '2022 年 12 月，还没有官方 API，这个项目逆向了网页会话，塞进微信公众号的被动回复接口。微信对超时回复会重试三次，single-flight 设计保证三次重试不会变成三次生成。在官方 API 让它变得多余之前，它拿到了 378 颗星和 120 个 fork。',
    },
    district: 'tools',
    year: 2022,
    stack: ['Go', 'WeChat MP', 'single-flight'],
    source: 'https://github.com/gtoxlili/wechat-chatGPT',
    stars: 378,
  },
]

export const shelf: { name: string; note: Bi; href: string }[] = [
  {
    name: 'Phantom Cipher · 怪盗密码',
    note: {
      en: 'The Da Vinci Code board game in a browser, Persona 5 styled; a four-character room code brings friends in.',
      zh: '浏览器里的达芬奇密码，Persona 5 风格，四位房间码拉朋友入局。',
    },
    href: 'https://cipher.gtio.work',
  },
  {
    name: 'tuna',
    note: {
      en: 'Vocabulary by word roots in the terminal; audio only through paired headphones.',
      zh: '终端里用词根推导背单词，声音只走绑定的耳机。',
    },
    href: 'https://github.com/gtoxlili/tuna',
  },
  {
    name: 'mlx-lazyserve',
    note: {
      en: 'Ollama-style lazy-loading MLX inference server for Apple Silicon, OpenAI-compatible.',
      zh: 'Ollama 风格、按需加载的 MLX 推理服务，跑在 Apple Silicon 上，OpenAI 兼容。',
    },
    href: 'https://github.com/gtoxlili/mlx-lazyserve',
  },
  {
    name: 'fiber-disconnect',
    note: {
      en: 'Detect client TCP disconnects inside Fiber v3 handlers via epoll and kqueue.',
      zh: '用 epoll / kqueue 在 Fiber v3 handler 里感知客户端 TCP 断开。',
    },
    href: 'https://github.com/gtoxlili/fiber-disconnect',
  },
  {
    name: 'pgx-adapter',
    note: {
      en: 'A Casbin adapter on pgx, without database/sql.',
      zh: '基于 pgx 的 Casbin 适配器，不经过 database/sql。',
    },
    href: 'https://github.com/gtoxlili/pgx-adapter',
  },
]
