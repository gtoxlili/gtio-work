# gtio.work

One person, a fleet of Agents, a small city of things that run.

Live at <https://www.gtio.work>.

Every picture on this site is the same model. A white maquette city, twelve
buildings on three terraces, photographed once from above, then from
twenty-four more positions, two for every building, then filmed: twenty-five
camera moves, each starting on one of those photographs and ending on the
next. The page scrubs that film. Scrolling is the camera: down flies forward
through the city, up flies back, and each chapter is the stretch where the
camera circles its building. Nothing ever cuts, because it is one continuous
flight.

The buildings are the work. The arena is a duelling game where an AI writes the
heart-method, the vault is a protocol that keeps an API key at home, the canal
lock is a resumable stream. The figure at the desk in the middle is the person
who built them.

The opening photograph assembles from 262,144 particles in a hand-written
WebGPU compute shader with no 3D library. The film is one H.264 stream decoded
frame by frame with WebCodecs, so any scroll position is one exact frame, in
either direction, with nothing buffered ahead but the next few frames.

Text is real DOM, prerendered in English and Chinese. Browsers without WebGPU
decode the same film onto a plain canvas; without WebCodecs a video element
seeks through it; with reduced motion the photograph stands still.

## Layout

```
site/     The page. src/film decodes and draws the film, src/gpu is the
          particle opening and the WGSL it shares, src/scroll.ts maps scroll
          to frames, src/content holds every string twice. public/film is the
          stream and its index; src/data/film.json says where each chapter's
          dwell and flight sit in it.
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

The pictures and the film the site serves are committed under `site/public`.
They are built from plates and clips that live outside this repository, so
that only happens on the machine that has them.

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
