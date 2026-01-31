# Support Desk 稼働状況可視化アプリ

リアルタイムでサポートデスクの稼働状況を可視化するWebアプリケーションです。

## 機能

- 📊 12デスクのリアルタイムステータス表示
- 🔄 複数端末間のリアルタイム同期（Socket.io）
- 📝 デスクごとのメモ機能
- 📈 統計レポート・CSV出力
- 🎨 ライト/ダークモード対応
- 📱 レスポンシブデザイン

## 技術スタック

- **フロントエンド**: HTML, CSS, JavaScript
- **バックエンド**: Node.js, Express, Socket.io
- **データベース**: SQLite (sql.js)
- **認証**: JWT

## ローカル起動

```bash
cd server
npm install
npm start
```

http://localhost:3000 にアクセス

## デフォルト認証情報

| ロール | ユーザー名 | パスワード |
|--------|-----------|-----------|
| 管理者 | admin | admin123 |
| 一般 | user | user123 |

## デプロイ

Renderへのデプロイは`render.yaml`で自動設定されます。
