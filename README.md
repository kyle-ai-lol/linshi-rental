# 林氏租屋

租屋物件列表網站。純靜態網站，用 Node.js 腳本從資料檔產生，部署在 GitHub Pages。

## 結構

- `data/site.json` — 品牌、標語、聯絡方式、關於我頁面內容
- `data/listings.csv` — 物件列表（之後會換成從 Google 試算表匯出的 CSV）
- `assets/style.css` — 網站樣式（溫馨居家感配色）
- `scripts/build.mjs` — 產生網站的腳本
- `docs/` — 產生出來的網站本體，GitHub Pages 直接讀這個資料夾（不要手動改這裡面的檔案，改了下次重新產生會被蓋掉）

## 更新網站內容

1. 改 `data/site.json` 或 `data/listings.csv`
2. 執行：

```bash
node scripts/build.mjs
```

3. 用 git 把改動 push 上去，GitHub Pages 會自動更新

## 物件欄位說明（listings.csv）

`id,area,name,addr,size,layout,price,floor,orientation,parking,pets,description,photo`

- `id`：網址用的英文代號，例如 `a`，會變成 `listings/a.html`
- `addr`：地址只寫到路名，不要放門牌號碼（公開頁面隱私考量）
- `photo`：物件照片網址（先留空，之後可以放 Google Drive 分享連結或圖床連結）
