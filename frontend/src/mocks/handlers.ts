import { http, HttpResponse, type RequestHandler } from 'msw'

// Auth handlers
const authHandlers: RequestHandler[] = [
  http.post('*/api/auth/logout', () =>
    HttpResponse.json({ message: 'Logged out' })
  ),
]

// Handlers are added per module migration as RTK Query endpoints are introduced.
export const handlers: RequestHandler[] = [...authHandlers]
