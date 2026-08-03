import XCTest

final class SampleAppTests: XCTestCase {
    func testFixturePasses() {
        XCTAssertEqual(1 + 1, 2)
    }

#if os(iOS)
    func testAccessibilityAudit() throws {
        let app = XCUIApplication()
        app.launch()
        try app.performAccessibilityAudit()
    }

    func testLaunchPerformance() {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
#endif
}
