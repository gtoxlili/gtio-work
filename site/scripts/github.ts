/**
 * Refresh the ledger numbers in src/data/github.json. Goes through the `gh` CLI
 * to borrow an existing login. The page dates these counts, so they update when
 * someone runs this, not on every deploy.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LOGIN = 'gtoxlili'
const out = path.resolve(import.meta.dirname, '../src/data/github.json')

const query = `{
  user(login: "${LOGIN}") {
    contributionsCollection {
      totalCommitContributions
      contributionCalendar { totalContributions }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes { name stargazerCount forkCount pushedAt }
    }
  }
}`

type Repo = { name: string; stargazerCount: number; forkCount: number; pushedAt: string }

const raw = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], { encoding: 'utf-8' })
const user = JSON.parse(raw).data.user
const repos: Repo[] = user.repositories.nodes
const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()

const data = {
  fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  commitsLastYear: user.contributionsCollection.totalCommitContributions,
  contributionsLastYear: user.contributionsCollection.contributionCalendar.totalContributions,
  reposOwned: user.repositories.totalCount,
  reposActiveLastYear: repos.filter(r => r.pushedAt > yearAgo).length,
  stars: repos.reduce((n, r) => n + r.stargazerCount, 0),
  forks: repos.reduce((n, r) => n + r.forkCount, 0),
  perRepo: Object.fromEntries(
    repos
      .filter(r => r.stargazerCount > 0)
      .sort((a, b) => b.stargazerCount - a.stargazerCount)
      .map(r => [r.name, r.stargazerCount]),
  ),
}

fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`)
console.log(
  `github.json: ${data.commitsLastYear} commits, ${data.stars} stars, ${data.reposActiveLastYear} active repos`,
)
