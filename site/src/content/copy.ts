import gh from '../data/github.json'
import type { Bi } from '../lang'

export const site = {
  title: {
    en: 'gtio — one person, a fleet of Agents, a small city of things that run',
    zh: 'gtio — 一个人，一群 Agent，一座会运转的小城',
  } as Bi,
  description: {
    en: 'Everything here was built for Agents or with them: arenas where they compete, the pipes they run on, tools they pick up by themselves. The trick is structural every time. Rust, Go, TypeScript, front to back, one person.',
    zh: '这里的东西不是为 Agent 造的，就是和 Agent 一起造的：它们竞技的场子、脚下的管道、能自己拿起来用的工具。诀窍每次都在结构上。Rust、Go、TypeScript，从前端到后端，一个人。',
  } as Bi,
  url: 'https://www.gtio.work/',
  github: 'https://github.com/gtoxlili',
}

export const nav = {
  github: 'GitHub',
  langLabel: { en: 'Language', zh: '语言' } as Bi,
  skip: { en: 'Skip to the works', zh: '跳到作品' } as Bi,
  scroll: { en: 'Scroll', zh: '向下滚动' } as Bi,
}

export const hero = {
  epigraph: { en: 'Life feeds on negative entropy.', zh: '生命以负熵为食。' } as Bi,
  epigraphBy: { en: 'Schrödinger, 1944', zh: '薛定谔，1944' } as Bi,
  title: {
    en: ['One person,', 'a fleet of Agents,', 'a small city', 'of things that run.'],
    zh: ['一个人，', '一群 Agent，', '一座会运转', '的小城。'],
  } as Bi<string[]>,
  lede: {
    en: 'Everything here was built for Agents or with them: arenas where they compete, the pipes they run on, tools they pick up by themselves. The trick is structural every time: change the shape of the problem, not the amount of effort.',
    zh: '这里的东西不是为 Agent 造的，就是和 Agent 一起造的：它们竞技的场子、脚下的管道、能自己拿起来用的工具。诀窍每次都在结构上：改问题的形状，而不是使更大的劲。',
  } as Bi,
  meta: { en: 'Gt · South China · Rust, Go, TypeScript', zh: 'Gt · 华南 · Rust、Go、TypeScript' } as Bi,
  caption: {
    en: 'The city, building by building, as the page scrolls.',
    zh: '随页面滚动，小城一栋一栋展开。',
  } as Bi,
}

export const worksCopy = {
  district: { en: 'District', zh: '区' } as Bi,
  of: { en: 'of', zh: '/' } as Bi,
  source: { en: 'GitHub', zh: 'GitHub' } as Bi,
  stars: { en: 'stars', zh: '星' } as Bi,
  builtWith: { en: 'Built with', zh: '用到' } as Bi,
  shelfTitle: { en: 'Smaller things on the shelf', zh: '架子上的小东西' } as Bi,
}

export const dayJob = {
  title: { en: 'The day job', zh: '白天的工作' } as Bi,
  lead: {
    en: 'Head of engineering at a company that builds Agent harnesses.',
    zh: '在一家做 Agent harness 的公司做技术负责人。',
  } as Bi,
  body: {
    en: 'The whole stack, from the runtime the Agents run in to the edge that serves it. All of it in production.',
    zh: '从 Agent 跑在里面的运行时，到最外层的边缘，整条技术线，全部在线上跑着。',
  } as Bi,
  floors: [
    {
      name: { en: 'Agent runtime, in Go', zh: 'Agent 运行时，Go' },
      items: {
        en: 'tool contracts, retrieval, memory, a streaming protocol, async pipelines, in-process code execution',
        zh: '工具契约、检索、记忆、流式协议、异步管线、进程内代码执行',
      },
    },
    {
      name: { en: 'Middlewares, in Rust', zh: '中间件，Rust' },
      items: {
        en: 'document extraction over gRPC, a unified auth service that doubles as an OIDC provider, a WASM fingerprint SDK for mainland-China in-app browsers, rate-limited scheduling of upstream keys',
        zh: 'gRPC 文档抽取、兼作 OIDC provider 的统一认证、面向国内 App 内置浏览器的 WASM 指纹 SDK、上游密钥的限流调度',
      },
    },
    {
      name: { en: 'Surfaces', zh: '界面' },
      items: {
        en: "the React console, an Electron desktop build that runs the loop on the user's own machine, a terminal client",
        zh: 'React 控制台、把 Agent loop 跑在用户本机的 Electron 桌面端、终端客户端',
      },
    },
    {
      name: { en: 'Money and edge', zh: '钱和边缘' },
      items: {
        en: 'a payments service for WeChat Pay and Alipay, the edge nginx in front of everything, GitHub Actions to deploy it, traces and session replay in OpenObserve',
        zh: '微信支付和支付宝的统一支付中间件、挡在最前面的边缘 nginx、GitHub Actions 部署、trace 和会话回放落在 OpenObserve',
      },
    },
  ] as { name: Bi; items: Bi }[],
}

export const ledger = {
  title: { en: 'Ledger', zh: '账本' } as Bi,
  note: {
    en: `Counted from GitHub on ${gh.fetchedAt.slice(0, 10)}.`,
    zh: `${gh.fetchedAt.slice(0, 10)} 从 GitHub 统计。`,
  } as Bi,
  rows: [
    {
      label: { en: 'Commits, last twelve months', zh: '过去十二个月的 commit' },
      value: gh.commitsLastYear.toLocaleString('en-US'),
    },
    {
      label: { en: 'Of those, in public repositories', zh: '其中公开仓库' },
      value: gh.publicCommitsLastYear.toLocaleString('en-US'),
    },
    {
      label: { en: 'Repositories touched, last twelve months', zh: '过去十二个月动过的仓库' },
      value: String(gh.reposActiveLastYear),
    },
    {
      label: { en: 'Stars across public repositories', zh: '公开仓库的星星' },
      value: gh.stars.toLocaleString('en-US'),
    },
    { label: { en: 'Languages, by volume', zh: '语言，按代码量' }, value: gh.languages.join(', ') },
  ] as { label: Bi; value: string | Bi }[],
}

export const operator = {
  title: { en: 'The one at the desk', zh: '桌前那个人' } as Bi,
  body: {
    en: [
      'Gt. Engineer, South China. Making things since 2019, alone since 2024.',
      'GitHub bio: a line from Schrödinger, life feeds on negative entropy. Disorder in, order out; the order comes out looking like these buildings.',
      "A preference for problems where the trick is structural: a TV that isn't a TV, a key that never travels, one program instead of forty tool calls. All of it runs on one small server behind Cloudflare.",
    ],
    zh: [
      'Gt，华南的工程师。2019 年开始做东西，2024 年开始一个人做。',
      'GitHub 简介是薛定谔的一句话：生命以负熵为食。把混沌吃进去，把秩序吐出来；吐出来的秩序，长得像上面这些房子。',
      '偏爱诀窍在结构上的问题：一台不是电视的电视，一把从不出门的钥匙，一段程序代替四十次工具调用。这一页上的所有东西都跑在 Cloudflare 后面的一台小服务器上。',
    ],
  } as Bi<string[]>,
  write: { en: 'Mail', zh: '邮件' } as Bi,
  github: { en: 'GitHub', zh: 'GitHub' } as Bi,
}

export const footer = {
  date: '2026-09',
  privacy: {
    en: 'No analytics on the page itself; Cloudflare may count a visit at the edge. One cookie, for the language.',
    zh: '页面本身没有统计脚本；Cloudflare 可能在边缘计一次访问。只有一个记语言的 cookie。',
  } as Bi,
  colophon: {
    en: "Archivo, with the system's own Chinese. The city is one photograph lifted by its depth map; the 262,144 particles that assemble it are a WebGPU compute shader.",
    zh: '拉丁字体 Archivo，中文用系统字体。小城是一张照片按深度置换而成；聚合它的 262,144 个粒子是一段 WebGPU compute shader。',
  } as Bi,
  noGpu: {
    en: 'Without WebGPU the city holds still. It moves in Chrome, Edge, Safari 26 and Firefox 141 or newer.',
    zh: '没有 WebGPU 时小城是静止的；在 Chrome、Edge、Safari 26、Firefox 141 及更新的版本里它会动。',
  } as Bi,
}
