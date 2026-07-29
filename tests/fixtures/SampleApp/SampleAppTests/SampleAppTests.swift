import Testing

struct SampleAppTests {
    @Test
    func fixturePasses() {
        #expect(1 + 1 == 2)
    }
}
