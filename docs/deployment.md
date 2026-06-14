# 部署指南

Cullr 是純靜態 SPA（zero backend），`pnpm build` 產出的 `dist/` 可丟到任何靜態主機。
`vite.config.ts` 已設 `base: "./"`，相對路徑在子路徑部署（如 GitHub Pages）也能正常載入。

## 選項 A：Cloudflare Pages（推薦）
- 根網域 / 自訂網域容易、CDN 快、免費額度大。
- 設定：連 GitHub repo → Framework preset 選 **Vite** →
  - Build command：`pnpm build`
  - Build output：`dist`
- 每次 push `main` 自動部署。

## 選項 B：GitHub Pages
最省事——repo 已是 public。用一支 workflow 在 push 時 build 並發布：

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```
然後 repo Settings → Pages → Source 選 **GitHub Actions**。
（`base: "./"` 已處理 `user.github.io/cullr/` 子路徑。）

## 注意
- **HTTPS 必要**：File System Access API 僅在安全來源（https 或 localhost）可用——
  兩個平台預設都是 https，沒問題。
- 無環境變數、無祕密、無伺服器成本：純靜態，照片永遠不離開使用者瀏覽器。
