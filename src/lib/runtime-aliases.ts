import * as fs from 'node:fs';
import * as path from 'node:path';

import { parse } from 'jsonc-parser';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv: string[]) {
  const res: Record<string, any> = {};

  const normalizeKey = (key: string) =>
    key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  const normalizeValue = (val: any) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return val;
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('--')) continue;

    const eqIndex = arg.indexOf('=');

    let key: string;
    let val: any = true;

    // --key=value
    if (eqIndex !== -1) {
      key = arg.slice(2, eqIndex);
      val = arg.slice(eqIndex + 1);

    } else {
      key = arg.slice(2);

      const next = argv[i + 1];

      // --key value
      if (next && !next.startsWith('-')) {
        val = next;
        i++;
      }
    }

    const normalizedKey = normalizeKey(key);
    res[normalizedKey] = normalizeValue(val);
  }

  return res;
}

function defaultTransformPath(p: string) {
  return p
    .replace(/^libs\//, 'dist/libs/')
    .replace(/\/index\.ts$/, '/index.js')
    .replace(/\.ts$/, '.js');
}

function loadTransformFunction(spec: string | undefined, rootDir: string) {
  if (!spec) {
    return defaultTransformPath;
  }

  if (spec.startsWith('inline:')) {
    const code = spec.slice('inline:'.length).trim();

    const fn = new Function(`return (${code});`)();

    if (typeof fn !== 'function') {
      throw new Error('--transform-inline must evaluate to a function');
    }

    return fn;
  }

  const resolved = path.resolve(rootDir, spec);

  // eslint-disable-next-line
  const mod = require(resolved);

  const fn = mod.default || mod.transformPath || mod;

  if (typeof fn !== 'function') {
    throw new Error(`Transform module must export function: ${resolved}`);
  }

  return fn;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string) {
  const escaped = escapeRegex(pattern);

  return new RegExp(
    '^' + escaped.replace(/\\\*/g, '(.*)') + '$',
  );
}

function applyWildcard(pattern: string, value: string) {
  return pattern.includes('*')
    ? pattern.replace('*', value)
    : pattern;
}

function resolveCandidate(basePath: string) {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.cjs`,
    `${basePath}.mjs`,
    `${basePath}.json`,

    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.cjs'),
    path.join(basePath, 'index.mjs'),
    path.join(basePath, 'index.json'),
  ];

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);

      if (stat.isFile()) {
        return candidate;
      }
    } catch { }
  }

  return null;
}

export function registerRuntimeAliases() {
  const rootDir = process.cwd();

  const args = parseArgs(process.argv);

  const mode = args.mode || 'memory';

  const baseFile = path.resolve(
    rootDir,
    args.base || 'tsconfig.base.json',
  );

  const outFile = path.resolve(
    rootDir,
    args.out || 'tsconfig.runtime.json',
  );

  const transformPath = loadTransformFunction(
    args.transform,
    rootDir,
  );

  const sourceText = fs.readFileSync(baseFile, 'utf8');

  const sourceConfig = parse(sourceText);

  const sourcePaths =
    sourceConfig?.compilerOptions?.paths;

  if (!sourcePaths) {
    throw new Error(
      'compilerOptions.paths not found',
    );
  }

  const runtimePaths: Record<string, string[]> = {};

  for (const [alias, targets] of Object.entries<any>(sourcePaths)) {
    runtimePaths[alias] = targets.map(transformPath);
  }

  if (mode === 'file') {
    const runtimeConfig = {
      ...sourceConfig,
      compilerOptions: {
        ...sourceConfig.compilerOptions,
        paths: runtimePaths,
      },
    };

    fs.writeFileSync(
      outFile,
      JSON.stringify(runtimeConfig, null, 2) + '\n',
      'utf8',
    );

    console.log(`Wrote ${outFile}`);
  }

  const rules = Object.entries(runtimePaths).map(
    ([aliasPattern, targets]) => ({
      aliasPattern,
      regex: aliasPattern.includes('*')
        ? patternToRegex(aliasPattern)
        : null,
      targets,
    }),
  );

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        specifier.startsWith('file:') ||
        specifier.startsWith('data:')
      ) {
        return nextResolve(specifier, context);
      }

      for (const rule of rules) {
        if (!rule.regex) {
          if (specifier !== rule.aliasPattern) {
            continue;
          }

          for (const target of rule.targets) {
            const resolved = resolveCandidate(
              path.resolve(rootDir, target),
            );

            if (resolved) {
              return {
                url: pathToFileURL(resolved).href,
                shortCircuit: true,
              };
            }
          }

          continue;
        }

        const match = rule.regex.exec(specifier);

        if (!match) {
          continue;
        }

        const wildcardValue = match[1];

        for (const target of rule.targets) {
          const substituted = applyWildcard(
            target,
            wildcardValue,
          );

          const resolved = resolveCandidate(
            path.resolve(rootDir, substituted),
          );

          if (resolved) {
            return {
              url: pathToFileURL(resolved).href,
              shortCircuit: true,
            };
          }
        }
      }

      return nextResolve(specifier, context);
    },
  });
}