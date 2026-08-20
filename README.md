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

`id,status,area,name,addr,size,layout,price,floor,orientation,parking,pets,description,photo,tag_subsidy,tag_cat,tag_dog,tag_elevator,tag_parking,tag_balcony,tag_flatutility`

- `id`：網址用的英文代號，例如 `a`，會變成 `listings/a.html`
- `status`：**一定要是 `published` 這個字才會真的上架**，其他任何值（`draft`、打錯字、留空）都會被跳過、不會出現在網站上。規則：新物件先用 `draft` 加進表格，等確認實際有空屋、可以上架了，再把這欄改成 `published`，然後重新產生網站
- `addr`：地址只寫到路名，不要放門牌號碼（公開頁面隱私考量）
- `price`：純數字（例如 `15000`），不要加 `NT$` 或逗號，網站會自動排版
- `photos`：照片檔名，多張用 `|` 分開（例如 `1.jpg|2.jpg|3.jpg`），對應 `assets/photos/<id>/` 資料夾裡的檔案。第一張是列表卡片跟詳情頁大圖，其餘是縮圖。留空就顯示預設的房子圖示
- `tag_*`：這 7 欄對應網站上的「特色」篩選標籤（可租補/可貓/可狗/有電梯/有車位/有陽台/台水電），格子裡打任何東西就算「有」，留空就是「沒有」
