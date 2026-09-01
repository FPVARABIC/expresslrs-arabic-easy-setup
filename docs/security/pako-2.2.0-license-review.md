# Exact dependency license review — pako 2.2.0

- Package: `pako`
- Exact version: `2.2.0`
- Upstream tag: `2.2.0`
- Upstream commit: `c743a323fb7dd18d70e260a104ce7e22f8f106f0`
- Observed SPDX-style expression: `(MIT AND Zlib)`
- Decision: approved for this exact package and version only

## Evidence

The upstream `package.json` at tag `2.2.0` declares version `2.2.0` and license expression `(MIT AND Zlib)`:

- <https://github.com/nodeca/pako/blob/2.2.0/package.json>

The upstream README explains the file-level split: MIT applies to all files except `/lib/zlib`, while Zlib applies to `/lib/zlib`:

- <https://github.com/nodeca/pako/blob/2.2.0/README.md#license>

The top-level MIT notice is published at:

- <https://github.com/nodeca/pako/blob/2.2.0/LICENSE>

## Review conclusion

Both MIT and Zlib are permissive licenses compatible with this dependency policy. The exception is intentionally bound to `pako@2.2.0`; a different package, version, or observed expression requires a new review. License notices must remain available in the generated dependency inventory and product distribution obligations must continue to be checked before release.
