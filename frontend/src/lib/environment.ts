/** Même interface, API séparée : aucun appel du test ne rejoint le tapis réel. */
export const courseTest = location.pathname === '/test-course/' || location.pathname.startsWith('/test-course/')
export const apiPath = (path: string) => `${courseTest ? '/test-course' : ''}${path}`
export const courseTestUrl = '/test-course/#/test'
