# eba-cli

> **Dành cho các Expo developer đang bị giới hạn số lần build iOS.**

Nếu bạn đang dùng **Expo EAS** và đã hết build credits miễn phí (30 builds/tháng), `eba-cli` là giải pháp thay thế giúp bạn build iOS trực tiếp trên **Xcode Cloud** — miễn phí 25 giờ compute/tháng với tài khoản Apple Developer.

---

## Tại sao eba-cli?

| | Expo EAS Free | Xcode Cloud |
|---|---|---|
| Build iOS | 30 builds/tháng | 25 giờ compute/tháng |
| Giá | Hết quota → trả phí | Miễn phí với Apple Developer ($99/năm) |
| Setup | Không cần | Cần setup 1 lần |

`eba-cli` xử lý phần setup và trigger build Xcode Cloud ngay từ terminal — không cần mở App Store Connect.

**[Xem hướng dẫn setup Xcode Cloud chi tiết →](./XCODE_CLOUD_GUIDE.md)**

---

## Cài đặt

```bash
npm install -g eba-cli
```

---

## Yêu cầu

- Node.js >= 18
- Tài khoản [Apple Developer](https://developer.apple.com) ($99/năm)
- Xcode Cloud đã được kích hoạt trên App Store Connect
- Dự án Expo / React Native với file `app.json`

---

## Commands

### `eba init`

Tạo file `eba.json` trong thư mục dự án — chứa cấu hình cho `eba build`.

```bash
eba init
```

Sau đó điền `ascAppId` vào `eba.json`:

```json
{
  "cli": { "version": "1.1.0" },
  "build": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_ID"
      }
    }
  }
}
```

> `ascAppId` là App ID trong App Store Connect → Apps → chọn app → copy từ URL.

---

### `eba prebuild`

Generate `ios/ci_scripts/` — các shell script cần thiết để Xcode Cloud tự động cài dependencies và build đúng cách.

```bash
# Chạy sau khi đã có ios/ folder (từ expo prebuild hoặc có sẵn)
eba prebuild
```

Files được tạo:
- `ios/ci_scripts/ci_post_clone.sh` — cài Node, npm, CocoaPods sau khi clone
- `ios/ci_scripts/ci_pre_xcodebuild.sh` — sync Manifest.lock, set build number
- `ios/ci_scripts/ci_post_build.sh` — log sau khi build xong

Sau khi chạy, **push `ios/` lên GitHub** trước khi trigger build:

```bash
git add ios/
git commit -m "chore: add xcode cloud ci scripts"
git push
```

---

### `eba build`

Trigger build trên Xcode Cloud ngay từ terminal.

```bash
eba build
# hoặc chỉ định environment
eba build --env production
```

Flow:
1. Đọc `ascAppId` từ `eba.json`
2. Login Apple ID (session được cache 1 giờ, không cần login lại)
3. Tìm Xcode Cloud workflow của app
4. Trigger build
5. Trả về URL để theo dõi build log

---

## Workflow đầy đủ

```bash
# 1. Khởi tạo config
eba init
# Điền ascAppId vào eba.json

# 2. Generate ci_scripts (chỉ cần làm 1 lần hoặc khi thay đổi)
eba prebuild
git add ios/ && git commit -m "chore: ci scripts" && git push

# 3. Trigger build mỗi khi cần
eba build
```

---

## Setup Xcode Cloud

Xem hướng dẫn chi tiết tại **[XCODE_CLOUD_GUIDE.md](./XCODE_CLOUD_GUIDE.md)**

---

## License

MIT
