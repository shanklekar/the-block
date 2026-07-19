import "@testing-library/jest-dom/vitest";

class IntersectionObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = IntersectionObserverMock;
}
