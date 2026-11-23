# Development

Checking the game in a browser, and how it deploys.

## Browser verification

The default PNG sprite kit shares one palette across the interface, characters, items, cards and terrain; non-default UI and Game themes take precedence in their own areas.
Its art guidelines and export tools are described in [UI sprites](../art/ui-sprites.md).

Start `npm run dev` in another terminal, then run `npm run test:browser`.
See [docs/agents/testing.md](../agents/testing.md) for browser-channel and screenshot details.

## GitHub Pages

The included `.github/workflows/static.yml` installs dependencies, runs tests and the production build, then deploys **dist/** on pushes to `main` or manual workflow dispatch.
In repository Settings → Pages, select **GitHub Actions** as the source.
Vite uses relative asset paths for repository subpaths.
