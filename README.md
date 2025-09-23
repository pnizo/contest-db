# Spreadsheet DB - 成績管理システム

Google Spreadsheetをデータベースとして使用する成績管理システムです。

## 機能

### ユーザー管理機能
- ユーザーの作成、読み取り、更新、削除（CRUD）
- **認証・認可システム**：ログイン認証とロールベースアクセス制御
- **権限管理**：管理者は全機能、一般ユーザーは閲覧のみ
- **パスワード管理**：bcryptによるセキュアなパスワードハッシュ化
- **セッション管理**：Express-sessionによる安全なセッション管理
- **論理削除機能**：削除されたユーザーは物理的に削除されず、`isValid`フラグで管理
- **自動復元**：削除済みユーザーと同じメールアドレスでユーザー作成時、自動的に復元
- **削除済みユーザー管理**：削除済みユーザーの表示、復元、完全削除

### 大会成績管理機能
- **独立したデータベース**：Usersシートとは関連付けされない独立システム
- **高速CSVインポート**：Google Sheets APIの`spreadsheets.values.append`を使用した高速バッチインポート（認証済みユーザー）
- **論理削除・復元**：成績データの論理削除と復元機能（管理者のみ）
- **フィルタリング機能**：NPCJ番号、大会名、カテゴリー名、選手名、期間での絞り込み
- **検索機能**：リアルタイム検索による成績の抽出

### 共通機能
- リアルタイムでスプレッドシートと同期
- レスポンシブなWebインターフェース
- データ検証とエラーハンドリング

## セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Google Cloud Console の設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存のプロジェクトを選択
3. Google Sheets API を有効化
4. サービスアカウントを作成：
   - IAM & Admin > サービスアカウント
   - 「サービスアカウントを作成」をクリック
   - 名前と説明を入力
   - キーを作成（JSON形式）

### 3. 環境変数の設定

1. `.env.example` を `.env` にコピー
2. ダウンロードしたJSON認証ファイルから以下の情報を取得：
   - `client_email`
   - `private_key`

```bash
cp .env.example .env
```

`.env` ファイルを編集：

```env
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
PORT=3000
```

### 4. Googleスプレッドシートの準備

1. 新しいGoogleスプレッドシートを作成
2. URLからスプレッドシートIDを取得（例：`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`）
3. サービスアカウントのメールアドレスに編集権限を付与

#### Usersシートの設定
4. 「Users」という名前のシートを作成
5. 最初の行にヘッダーを設定：

```
A1: id
B1: name  
C1: email
D1: role
E1: createdAt
F1: isValid
G1: deletedAt
H1: updatedAt
I1: restoredAt
J1: password
```

#### Scoresシート（大会成績）の設定
6. 「Scores」という名前のシートを作成
7. 最初の行にヘッダーを設定：

```
A1: id
B1: fwj_card_no
C1: contest_date
D1: contest_name
E1: contest_place
F1: category_name
G1: placing
H1: player_no
I1: player_name
J1: createdAt
K1: isValid
L1: deletedAt
M1: updatedAt
N1: restoredAt
```

**重要**：Scoresシートは独立したデータベースであり、Usersシートとは関連付けされません。CSVインポート時は高速化のため、データの重複チェックは行わずに直接追記されます。

### 5. アプリケーションの起動

```bash
npm start
```

または開発モード：

```bash
npm run dev
```

アプリケーションは `http://localhost:3000` でアクセスできます。

### 6. 初期管理者アカウントの作成

以下の方法のいずれかを選択してください：

#### 方法1: 自動作成スクリプトを使用（推奨）

```bash
npm run create-admin
```

これにより、以下の管理者アカウントが自動作成されます：
- メールアドレス: admin@example.com
- パスワード: admin123

#### 方法2: カスタムパスワードでハッシュを生成

```bash
npm run hash-password <あなたのパスワード>
```

例：
```bash
npm run hash-password mySecurePassword123
```

生成されたハッシュをスプレッドシートに手動で入力：
1. スプレッドシートを開く
2. 2行目に以下のデータを入力：
   - A2: admin_001
   - B2: 管理者
   - C2: admin@example.com  
   - D2: admin
   - E2: (現在日時)
   - F2: TRUE
   - G2〜I2: (空白)
   - J2: (生成されたハッシュ値)

#### 方法3: テストアカウントを使用

ログイン画面のテストアカウント情報を使用してください。

## API エンドポイント

### ユーザー管理
- `GET /api/users` - アクティブユーザーの取得
- `GET /api/users/:id` - 特定ユーザーの取得
- `POST /api/users` - 新規ユーザーの作成（同じメールの削除済みユーザーがいる場合は自動復元）
- `PUT /api/users/:id` - ユーザー情報の更新
- `DELETE /api/users/:id` - ユーザーの論理削除

### 論理削除管理（管理者のみ）
- `GET /api/users/deleted/list` - 削除済みユーザーの取得
- `PUT /api/users/:id/restore` - ユーザーの復元
- `DELETE /api/users/:id/permanent` - ユーザーの完全削除

### 認証・認可
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `GET /api/auth/status` - 認証状態の確認
- `GET /api/auth/me` - 現在のユーザー情報取得
- `POST /api/auth/change-password` - パスワード変更

### 大会成績管理
- `GET /api/scores` - 全成績取得（クエリパラメータでフィルタリング可能）
  - `?fwj_card_no=XXX` - NPCJ番号で絞り込み
  - `?contest_name=XXX` - 大会名で絞り込み
  - `?category_name=XXX` - カテゴリー名で絞り込み  
  - `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - 期間で絞り込み
- `GET /api/scores/:id` - 特定成績取得
- `POST /api/scores/import` - 高速CSVバッチインポート（認証済みユーザー、重複チェックなし）
- `PUT /api/scores/:id` - 成績更新（管理者のみ）
- `DELETE /api/scores/:id` - 成績論理削除（管理者のみ）

### 成績論理削除管理（管理者のみ）
- `GET /api/scores/deleted/list` - 削除済み成績取得
- `PUT /api/scores/:id/restore` - 成績復元
- `DELETE /api/scores/:id/permanent` - 成績完全削除

### 成績検索
- `GET /api/scores/npcj/:fwjNo` - NPCJ番号別成績取得
- `GET /api/scores/composite/:fwjNo/:contestDate/:contestName/:categoryName` - 複合キー検索

## プロジェクト構造

```
spreadsheet-db/
├── config/
│   └── sheets.js          # Google Sheets API設定
├── models/
│   ├── BaseModel.js       # 基本モデルクラス
│   ├── User.js           # ユーザーモデル
│   └── Score.js          # 成績モデル
├── routes/
│   ├── users.js          # ユーザーAPIルート
│   ├── scores.js         # 成績APIルート
│   └── auth.js           # 認証APIルート
├── middleware/
│   └── auth.js           # 認証・認可ミドルウェア
├── public/
│   ├── index.html        # ユーザー管理HTML
│   ├── scores.html       # 成績管理HTML
│   ├── login.html        # ログインHTML
│   ├── styles.css        # 共通CSS
│   ├── script.js         # ユーザー管理JavaScript
│   ├── scores-script.js  # 成績管理JavaScript
│   └── login-script.js   # ログインJavaScript
├── utils/
│   ├── createAdmin.js    # 初期管理者作成スクリプト
│   └── hashPassword.js   # パスワードハッシュ化スクリプト
├── server.js             # Express.jsサーバー
├── package.json
├── .env.example
└── README.md
```

## 使用技術

- **バックエンド**: Node.js, Express.js
- **データベース**: Google Sheets API
- **フロントエンド**: HTML, CSS, JavaScript
- **認証**: Google Service Account

## トラブルシューティング

### 「Error: No key or keyFile set」エラー
- `.env` ファイルの `GOOGLE_SHEETS_PRIVATE_KEY` が正しく設定されているか確認
- プライベートキーが適切にエスケープされているか確認

### 「The caller does not have permission」エラー
- サービスアカウントにスプレッドシートの編集権限が付与されているか確認
- スプレッドシートIDが正しいか確認

### データが表示されない
- スプレッドシートのヘッダー行が正しく設定されているか確認
- ネットワーク接続を確認
- ブラウザの開発者ツールでエラーを確認