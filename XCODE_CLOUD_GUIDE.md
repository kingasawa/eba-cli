# Hướng dẫn build iOS với Xcode Cloud

Xcode Cloud là dịch vụ CI/CD tích hợp sẵn trong Xcode và App Store Connect, cho phép build iOS app trực tiếp trên server của Apple. Miễn phí **25 giờ compute/tháng** với tài khoản Apple Developer.

---

## Yêu cầu trước khi bắt đầu

- Tài khoản [Apple Developer Program](https://developer.apple.com/programs/) ($99/năm)
- App đã được tạo trên [App Store Connect](https://appstoreconnect.apple.com)
- Source code lưu trên GitHub (hoặc Bitbucket, GitLab)
- Xcode 13+ cài đặt trên máy

---

## Bước 1 — Kết nối GitHub với App Store Connect

1. Vào [App Store Connect](https://appstoreconnect.apple.com) → **Xcode Cloud**
2. Chọn app của bạn → **Get Started** (hoặc **Add Workflow** nếu đã có)
3. Xcode Cloud sẽ yêu cầu cấp quyền truy cập GitHub → **Connect to GitHub**
4. Authorize trên GitHub, chọn repository của bạn

---

## Bước 2 — Tạo Workflow

Workflow là bộ cấu hình cho một loại build (ví dụ: build để test, build để release).

1. Trong App Store Connect → Xcode Cloud → chọn app → **Manage Workflows**
2. Nhấn **+** để tạo workflow mới
3. Cấu hình cơ bản:

| Field | Giá trị gợi ý |
|---|---|
| Name | `Production Build` |
| Environment | Xcode (chọn version mới nhất) |
| Clean Build | Enabled |
| Start Condition | Manual (hoặc Push to branch `main`) |

4. **Archive** → chọn scheme của app (thường là tên app)
5. **Post-Actions** → thêm **TestFlight Internal Testing** nếu muốn tự động upload

6. **Save**

---

## Bước 3 — Cấp quyền code signing

Xcode Cloud tự động quản lý certificates và provisioning profiles.

1. Trong workflow → **Environment** → **Xcode Managed Signing**: Enable
2. Lần đầu build, Xcode Cloud sẽ tạo certificate và profile tự động
3. Nếu bị từ chối: vào **App Store Connect → Users and Access → Integrations** → kiểm tra quyền của Xcode Cloud

---

## Bước 4 — Setup ci_scripts với eba-cli

Xcode Cloud cần các script để cài dependencies (Node.js, CocoaPods) trước khi build.

```bash
# Trong thư mục dự án React Native / Expo của bạn:
eba prebuild
```

Lệnh này tạo ra:

```
ios/
  ci_scripts/
    ci_post_clone.sh      ← chạy sau khi clone repo (cài npm + pods)
    ci_pre_xcodebuild.sh  ← chạy trước build (set build number)
    ci_post_build.sh      ← chạy sau build (logging)
```

Push lên GitHub:

```bash
git add ios/ci_scripts/
git commit -m "chore: add xcode cloud ci scripts"
git push
```

---

## Bước 5 — Lấy App ID

`eba build` cần `ascAppId` để biết phải build app nào.

1. Vào [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → chọn app
2. Nhìn trên URL: `https://appstoreconnect.apple.com/apps/`**`1234567890`**`/...`
3. Con số đó chính là `ascAppId`

Điền vào `eba.json`:

```json
{
  "build": {
    "production": {
      "ios": {
        "ascAppId": "1234567890"
      }
    }
  }
}
```

---

## Bước 6 — Trigger build

```bash
eba build
```

1. Login Apple ID lần đầu (được cache 1 giờ)
2. Chọn team (nếu có nhiều team)
3. Build được trigger tự động
4. URL theo dõi build log được in ra:

```
✅ Build started!

  Track your build:
  https://appstoreconnect.apple.com/apps/1234567890/xcode-cloud
```

---

## Troubleshooting

### Build fail ở bước `pod install`

`ci_post_clone.sh` không tìm được Node.js. Kiểm tra:
- Node đã được cài qua nvm chưa
- Thử thêm path thủ công vào đầu script nếu nvm path khác

### Lỗi `No Xcode Cloud product found`

- App chưa được kích hoạt Xcode Cloud → vào App Store Connect → chọn app → **Xcode Cloud** → Get Started
- Hoặc `ascAppId` trong `eba.json` bị sai

### Lỗi `No workflows found`

- Chưa tạo workflow → làm theo Bước 2

### Lỗi code signing

- Vào App Store Connect → Xcode Cloud → Settings → kiểm tra permissions
- Đảm bảo bundle ID trong `Info.plist` khớp với app trên App Store Connect

### Session hết hạn

`eba build` cache session 1 giờ. Nếu quá 1 giờ, login lại tự động khi chạy `eba build`.

---

## So sánh với Expo EAS

| | EAS Build (Free) | Xcode Cloud |
|---|---|---|
| Giới hạn | 30 builds/tháng | 25 giờ/tháng |
| Thời gian build | ~5-10 phút | ~10-20 phút |
| Setup | Không cần | Cần setup 1 lần |
| Tùy chỉnh | Giới hạn | Toàn quyền qua ci_scripts |
| Logs | EAS Dashboard | App Store Connect |
| TestFlight | Tự động | Tự động (nếu cấu hình) |

> Với app production thực tế, 25 giờ compute Xcode Cloud ~ 75-100 builds/tháng tùy độ phức tạp.
