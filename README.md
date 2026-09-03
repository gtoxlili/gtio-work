# gtio.work

One person, a fleet of Agents, a small city of things that run.

Live at <https://www.gtio.work>.

Every picture on this site is the same picture. A white maquette city, twelve
buildings on three terraces, photographed once. A depth map lifts it into a mesh
in WebGPU, and scrolling moves one camera over that mesh: it settles on a
building for each chapter, orbits it while the wheel turns, then flies to the
next. Nothing ever cuts between images, because there is only one image.

The buildings are the work. The arena is a duelling game where an AI writes the
heart-method, the vault is a protocol that keeps an API key at home, the canal
lock is a resumable stream. The figure at the desk in the middle is the person
who built them.

The lighting, the depth of field, and the 262,144 particles that assemble the
city on load are one hand-written WebGPU pipeline with no 3D library.

Text is real DOM, prerendered in English and Chinese. Browsers without WebGPU
pan and zoom the same photograph to the same shots.

## Layout

```
site/     The page. src/gpu is the engine and the WGSL, src/content/shots.ts is
          one camera shot per chapter, src/content holds every string twice.
deploy/   The vhost and the script that ships it.
```

## Running it

From `site/`:

```bash
pnpm install
pnpm dev       # localhost:5173
pnpm build     # type-check, bundle, prerender both languages, compress
```

`pnpm lint` is Biome. `pnpm github` recounts the ledger, and a scheduled
workflow runs it once a day; it writes only when a number moves, and that commit
is what triggers the next deploy.

The pictures the site serves are committed under `site/public`. `pnpm images`
rebuilds them from the full-size plates, which live outside this repository, so
it only runs on the machine that has them.

## Deploying

Push to `main`. The workflow builds, then runs `deploy/deploy.sh`, which rsyncs
`site/dist` to the origin and reloads nginx. The same script deploys from a
laptop, so there is one deploy path rather than two that drift.

The origin's address is not in this repo. Copy `deploy/.env.example` to
`deploy/.env` to deploy by hand. CI reads the same values from repository
variables and takes its SSH key from a repository secret.

## License

The code is MIT, so the engine is yours to take: the depth-displaced mesh, the
camera, the shaders, the build.

The pictures are not. Everything under `site/public/img` and `site/public/gpu`
stays under copyright: the city is the work this page exists to show, not a
component of it.
