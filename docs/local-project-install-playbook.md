# Cài iDevFlow theo từng project

Playbook này cài iDevFlow vào đúng iOS app repository hiện tại. Nó không cài global cho các project khác.

## 1. Mở iOS app repository

```bash
cd /path/to/your-ios-app
git status
```

Project cần là Git repository. Đọc source package trước khi trust hoặc cài package có extension, vì extension có system access.

## 2. Cài package local

Dùng branch `main` mới nhất:

```bash
pi install -l git:github.com/imbriandev/idevflow@main
```

`-l` ghi package vào `.pi/settings.json` trong app repository. Mỗi lần cài hoặc update, Pi lấy revision hiện tại của `main`.

## 3. Trust và nạp extension

Khởi động Pi tại app repository:

```bash
pi
```

Chấp nhận project trust khi Pi hỏi. Nếu Pi đã mở trong folder này, chạy:

```text
/reload
```

## 4. Khởi tạo runtime project

Nói với Pi:

```text
Initialize iDevFlow for this trusted project, then help me define my app idea.
```

Pi tạo runtime state tại `.idevflow/`. Đây là state riêng của app project, cần giữ Git-ignored; nó không phải source của package iDevFlow.

## 5. Bắt đầu bằng hội thoại

Ví dụ:

```text
I want to build an iPhone app for freelancers who forget invoice follow-ups.
Help me validate the idea and define the smallest complete beta.
```

Coordinator hướng dẫn safe route theo runtime state. Không cần nhớ commands; các `/idev:*` commands chỉ là manual escape hatches.

## Verify

Trong app repository:

```bash
pi list
```

iDevFlow phải hiện là project-local package. Khi runtime đã khởi tạo, `/idevflow` hiển thị dashboard lifecycle.

## Update

Sau khi một revision mới được push lên `main`, cập nhật project bằng:

```bash
pi install -l git:github.com/imbriandev/idevflow@main
```

Sau đó chạy `/reload` hoặc khởi động lại Pi. Nếu cần reproducibility cho CI hoặc beta cụ thể, mới pin một tag/commit thay cho `main`.

## Remove khỏi một project

```bash
pi remove -l git:github.com/imbriandev/idevflow
```

Lệnh này chỉ bỏ package entry của project. Nó không xóa app source hoặc `.idevflow/` runtime history.
