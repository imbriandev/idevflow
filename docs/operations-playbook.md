# Pi iOS Operations Playbook

Hướng dẫn này mô tả cách vận hành Pi iOS từ ý tưởng đến TestFlight handoff. Pi iOS đang ở giai đoạn beta; mọi push, App Store Connect upload, và phân phối tester vẫn là quyết định manual của founder.

## 1. Chuẩn bị project

Trước khi bắt đầu, project cần:

- Git repository sạch với author identity hợp lệ;
- Node.js 22+, Pi 0.82.1+, macOS/Xcode và iOS simulator khi cần app verification;
- một Xcode app project tối thiểu trước build cho app mới.

Mở Pi trong thư mục app:

```bash
cd /path/to/MyApp
pi
```

Pi iOS được cài global nên tự load. Nếu phiên hiện tại được mở trước khi cập nhật extension, chạy `/reload`.

Yêu cầu agent khởi tạo runtime:

> Khởi tạo Pi iOS runtime cho project này.

Agent gọi `pi_ios_runtime initialize`. Local state nằm dưới `.pi-ios/`, được Git ignore. Không tự sửa nội dung thư mục này.

## 2. Define — cam kết sản phẩm nhỏ nhất

Chạy `/ios:define`, sau đó mô tả user, painful situation, current workaround và outcome mong muốn.

Ví dụ:

> Tôi muốn app giúp freelance designer ghi thời gian làm việc nhanh hơn. Hãy define Simple Lovable Complete scope cho beta đầu tiên.

Kết quả gồm target user, problem, promise, primary flow, empty/loading/failure/accessibility expectations, non-goals, assumptions và TestFlight learning question. Pi iOS ghi product documents tại `docs/pi-ios/product-memory.json` và `docs/pi-ios/slc.json`.

Founder phải trả lời rõ khi thay đổi target user, monetization hoặc product promise.

## 3. Plan — biến SLC thành work graph

Chạy `/ios:plan` sau khi define hoàn chỉnh.

Ví dụ:

> Lập kế hoạch cho SLC đã define. Ưu tiên SwiftUI, local-first SwiftData, không login ở beta đầu.

Plan tạo work graph với vertical slices, dependencies, path claims, risk, acceptance criteria và verification strategy. Agent trình bày graph fingerprint. Founder phải xác nhận plan rõ ràng; implementation chỉ bắt đầu sau plan approval.

Với persistence migration, identity, payment, permission, destructive data hoặc signing, nêu rõ scope để plan đánh dấu risk và stop condition phù hợp.

## 4. Build — triển khai một approved slice

Chạy `/ios:build` với slice cụ thể từ work graph.

Ví dụ:

> Implement slice “Create and start a time entry” theo approved plan.

Pi iOS tự thực hiện preflight, tạo isolated worktree, claim path, chọn specialist context, chạy verification, ghi postflight receipt và controlled integration. Không tự tạo worktree, không tự viết receipt, và không sửa ngoài path được claim.

Mỗi slice nên là một vertical behavior hoàn chỉnh, kèm focused tests khi có stable behavioral seam. Thay đổi architecture, payment, privacy, signing hoặc destructive behavior phải dừng để founder quyết định.

## 5. Test — biến uncertainty thành evidence

Dùng `/ios:test` cho bug, flaky behavior hoặc claim chưa được chứng minh.

Ví dụ:

> Reproduce và sửa lỗi: force-close app làm timer đang chạy không được khôi phục.

Luồng bắt buộc là reproduce, bounded diagnosis, narrow repair, regression proof và verification receipt. “Không reproduce được” không phải pass; không giảm độ chặt của test để build xanh.

Primary flow, accessibility hoặc performance claim cần simulator/XCTest evidence phù hợp, không chỉ build thành công.

## 6. Review — verdict độc lập trước beta

Dùng `/ios:review` sau integration verification.

Ví dụ:

> Review time-entry flow với focus SwiftUI state, accessibility, SwiftData persistence và privacy.

Review không sửa source. Nó tạo evidence-linked verdict gồm blockers, important findings, polish, residual risk và route sửa chữa. Nếu có finding cần repair, quay lại `/ios:build` hoặc `/ios:test`.

## 7. Ship — verified handoff, không external distribution

Dùng `/ios:ship` khi exact candidate đã review pass.

Pi iOS yêu cầu fresh release verification, critical ship context, privacy/release metadata, screenshot variants và XCTest quality evidence. Accessibility proof phải dùng `XCUIApplication.performAccessibilityAudit`; performance proof phải dùng named XCTest metric và project-owned budget.

Nếu StoreKit hoặc RevenueCat có mặt, monetization manifest và restore/entitlement evidence phải đầy đủ.

Khi gates pass, Pi iOS tạo candidate. Founder xác nhận approval token cho exact candidate; `promote` chỉ thay đổi local base branch. `handoff` tạo package nêu evidence, known issues và các bước external còn lại.

Pi iOS không push Git, archive/export IPA, đăng nhập App Store Connect, upload build hoặc phân phối tester.

## 8. Learn — quyết định vòng tiếp theo từ feedback

Sau beta, chạy `/ios:learn` và cung cấp feedback, incidents, metrics hoặc founder observations.

Ví dụ:

> Đây là feedback TestFlight tuần đầu: [dán feedback]. Hãy phân loại now/later/not-do và đề xuất next bet.

Pi iOS giữ nguyên user language có giá trị, phân biệt evidence với hypothesis và route next focus về define, plan, build hoặc test.

## Theo dõi và recovery

Yêu cầu agent kiểm tra status, hoặc dùng tools:

- `pi_ios_runtime status` — runtime/lifecycle state;
- `pi_ios_doctor status` — human-readable diagnostics;
- `pi_ios_doctor report` — metadata-only support report;
- `pi_ios_pipeline status` — multi-agent pipeline state;
- `pi_ios_pipeline reconcile` — detect/reconcile lost worker lease theo policy.

Recovery không xóa unintegrated source, branches, worktrees, packets hoặc logs. Không xóa `.pi-ios/` khi còn active work.

## Founder checklist

1. Define: xác nhận user, promise và non-goals.
2. Plan: approve frozen graph trước implementation.
3. High-risk change: quyết định architecture/privacy/payment/signing/destructive scope.
4. Review: chấp nhận hoặc route findings.
5. Ship: approve exact candidate và target.
6. External release: chủ động push/upload/distribute sau handoff.

## Quy tắc ngắn

- Không code trước approved plan.
- Không claim pass khi chưa có Pi iOS receipt.
- Không bypass worktree, path claim, verification hoặc approval gate.
- Không coi build xanh là đủ cho accessibility, performance hay release-quality claim.
- Không để agent tự push hoặc phân phối ra bên ngoài.
