# @unsonet/runtime-aliases

Runtime TypeScript path alias resolver for Node.js.

Works as a **Node preload hook (`-r`)** that allows ESM and CJS apps to resolve `tsconfig.paths` aliases at runtime.

---

# Why this exists

Node.js does not support TypeScript path aliases like:

```ts
import { x } from '@unsonet/utils';
```

at runtime.

This library fixes that by intercepting module resolution **before Node loads the app**.

---

# How it works

* Runs as a **CommonJS preload script**
* Registers `node:module` resolution hooks
* Translates `tsconfig.base.json → runtime paths`
* Resolves imports dynamically during execution

---

# Installation

```bash id="k3c9q1"
npm install @unsonet/runtime-aliases
```

---

# Usage (CLI preload)

## Run your app with aliases enabled

```bash id="8n1m2v"
node -r @unsonet/runtime-aliases app.js
```

or from dist:

```bash id="p0q8we"
node -r ./dist/libs/runtime-aliases/src/bin/runtime-aliases.cjs app.js
```

---

# Nx usage

```json id="v2x1aa"
{
  "targets": {
    "run": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node -r \"%CD%/dist/libs/runtime-aliases/src/bin/runtime-aliases.cjs\" {args.file} --mode=memory {args.args}",
        "forwardAllArgs": true
      }
    }
  }
}
```

---

# Requirements

* Node.js 20+
* TypeScript `paths` configured in `tsconfig.base.json`
* Compiled JS output (`dist/`)

---

# Features

* Supports ESM and CJS applications
* Supports wildcard aliases (`@app/*`)
* Works with Nx monorepos
* No ts-node required
* No runtime transpilation
* Zero bundler dependency

---

# Modes

## memory (default)

Registers aliases in memory only.

```bash id="4k1p3a"
node -r runtime-aliases.cjs app.js --mode=memory
```

---

## file

Generates runtime tsconfig:

```bash id="7z0qpp"
node -r runtime-aliases.cjs app.js --mode=file
```

Output:

```txt id="m1n0ab"
tsconfig.runtime.json
```

---

# tsconfig example

```json id="c9x1zz"
{
  "compilerOptions": {
    "paths": {
      "@unsonet/utils": ["libs/utils/src/index.ts"],
      "@unsonet/*": ["libs/*/src/index.ts"]
    }
  }
}
```

---

# How alias resolution works

Example:

```ts id="t1q9dd"
import { x } from '@unsonet/utils';
```

Resolved to:

```txt id="z9p2kk"
dist/libs/utils/src/index.js
```

---

# Build requirement (IMPORTANT)

The preload entry MUST be CommonJS.

```json id="c1aa9x"
{
  "format": ["cjs"]
}
```

Reason:

> `node -r` only supports CommonJS preload modules.

---

# Programmatic usage

```ts id="p9q2zz"
import { registerRuntimeAliases } from '@unsonet/runtime-aliases';

registerRuntimeAliases();
```

---

# Custom transform

```js id="t8q1aa"
module.exports = function transform(path) {
  return path
    .replace(/^libs\//, 'dist/libs/')
    .replace(/\.ts$/, '.js');
};
```

Run:

```bash id="f0q1bb"
node -r runtime-aliases.cjs app.js --transform ./transform.js
```

---

# Inline transform

```bash id="a9p2cc"
node -r runtime-aliases.cjs app.js \
  --transform="inline:(p)=>p.replace(/^libs\\//,'dist/libs/').replace(/\\.ts$/,'.js')"
```

---

# Important limitations

* `-r` works **only with CommonJS**
* ESM loader hooks require `--import` (different system)
* This library is not a bundler or transpiler

---

# Mental model

Think of it as:

> “tsconfig paths polyfill for Node module resolver”

not:

> “runtime compiler”

---

# License

MIT
