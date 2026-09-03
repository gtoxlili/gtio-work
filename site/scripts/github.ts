/**
 * Recount the ledger in src/data/github.json.
 *
 *   pnpm github
 *
 * Goes through the `gh` CLI, so it borrows an existing login locally and reads
 * GH_TOKEN in CI. Counting commits in private repositories needs a token that
 * can see them; without one those numbers come back low rather than wrong.
 *
 * Writes only when a number actually moved. The date on the page is the day the
 * counts last changed, so a run that finds nothing new leaves no commit behind.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LOGIN = 'gtoxlili'
const TOP_LANGUAGES = 4
const out = path.resolve(import.meta.dirname, '../src/data/github.json')

const query = `{
  user(login: "${LOGIN}") {
    contributionsCollection {
      totalCommitContributions
      commitContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate }
        contributions { totalCount }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes {
        isPrivate
        pushedAt
        stargazerCount
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`

type Repo = {
  isPrivate: boolean
  pushedAt: string
  stargazerCount: number
  languages: { edges: { size: number; node: { name: string } }[] }
}

const raw = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], {
  encoding: 'utf-8',
  maxBuffer: 8 * 1024 * 1024,
})
const user = JSON.parse(raw).data.user
const contributions = user.contributionsCollection
const repos: Repo[] = user.repositories.nodes

const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
const active = repos.filter(r => r.pushedAt > yearAgo)

// Language volume across everything touched this year, private repos included:
// the point is what was written, not what happens to be readable.
const bytes = new Map<string, number>()
for (const repo of active) {
  for (const { size, node } of repo.languages.edges) {
    bytes.set(node.name, (bytes.get(node.name) ?? 0) + size)
  }
}
const languages = [...bytes.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_LANGUAGES)
  .map(([name]) => name)

const byRepo: { repository: { isPrivate: boolean }; contributions: { totalCount: number } }[] =
  contributions.commitContributionsByRepository

const counts = {
  commitsLastYear: contributions.totalCommitContributions,
  publicCommitsLastYear: byRepo
    .filter(r => !r.repository.isPrivate)
    .reduce((n, r) => n + r.contributions.totalCount, 0),
  reposActiveLastYear: active.length,
  stars: repos.filter(r => !r.isPrivate).reduce((n, r) => n + r.stargazerCount, 0),
  languages,
}

const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf-8')) : {}
const { fetchedAt: _was, ...before } = previous
if (JSON.stringify(before) === JSON.stringify(counts)) {
  console.log('github.json: unchanged')
  process.exit(0)
}

const data = { fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), ...counts }
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`)
console.log(
  `github.json: ${data.commitsLastYear} commits (${data.publicCommitsLastYear} public), ` +
    `${data.reposActiveLastYear} repos, ${data.stars} stars, ${languages.join(', ')}`,
)
